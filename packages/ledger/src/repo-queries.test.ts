import type { Repo } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "./ledger.js";

const repo: Repo = {
  id: "r7k2m4pqrs",
  path: "/Users/dev/code/agnostic",
  kind: "git",
  name: "agnostic",
  addedAt: "2026-09-10T11:00:00.000Z",
};

const other: Repo = {
  id: "q4m8n2vwxy",
  path: "/Users/dev/code/notes",
  kind: "folder",
  name: "notes",
  addedAt: "2026-09-10T09:00:00.000Z",
};

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
});

afterEach(() => {
  ledger.close();
});

describe("repos.insert", () => {
  it("round-trips through get, getByPath and list", () => {
    expect(ledger.repos.insert(repo)).toEqual(repo);
    ledger.repos.insert(other);
    expect(ledger.repos.get(repo.id)).toEqual(repo);
    expect(ledger.repos.getByPath(repo.path)).toEqual(repo);
    expect(ledger.repos.get("z9z9z9z9z9")).toBeNull();
    expect(ledger.repos.getByPath("/nowhere")).toBeNull();
    expect(ledger.repos.list()).toEqual([other, repo]);
  });

  it("writes one repo.registered event carrying the repo", () => {
    ledger.repos.insert(repo);
    const events = ledger.events.after(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "repo.registered",
      repoId: repo.id,
      ts: repo.addedAt,
      payload: { repo },
    });
  });

  it("refuses a second repo with the same id or the same path", () => {
    ledger.repos.insert(repo);
    expect(() => ledger.repos.insert({ ...repo, path: "/elsewhere" })).toThrowError(
      expect.objectContaining({ code: "repo-exists" }),
    );
    expect(() => ledger.repos.insert({ ...repo, id: "q4m8n2vwxy" })).toThrowError(
      expect.objectContaining({ code: "repo-exists" }),
    );
    expect(ledger.repos.list()).toEqual([repo]);
    expect(ledger.events.latestId()).toBe(1);
  });
});

describe("repos.update", () => {
  it("moves the path and writes repo.updated", () => {
    ledger.repos.insert(repo);
    const moved = ledger.repos.update(repo.id, { path: "/Users/dev/src/agnostic" });
    expect(moved).toEqual({ ...repo, path: "/Users/dev/src/agnostic" });
    expect(ledger.repos.getByPath(repo.path)).toBeNull();
    expect(ledger.repos.getByPath(moved.path)).toEqual(moved);

    const events = ledger.events.after(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "repo.updated", payload: { repo: moved } });
  });

  it("upgrades the kind and leaves the other fields alone", () => {
    ledger.repos.insert(other);
    expect(ledger.repos.update(other.id, { kind: "git" })).toEqual({ ...other, kind: "git" });
  });

  it("refuses an unknown id and a path another repo holds", () => {
    ledger.repos.insert(repo);
    ledger.repos.insert(other);
    expect(() => ledger.repos.update("z9z9z9z9z9", { name: "gone" })).toThrowError(
      expect.objectContaining({ code: "repo-not-found" }),
    );
    expect(() => ledger.repos.update(other.id, { path: repo.path })).toThrowError(
      expect.objectContaining({ code: "repo-exists" }),
    );
  });

  it("writes nothing when the patch restates what the repo already holds", () => {
    ledger.repos.insert(repo);
    const latest = ledger.events.latestId();
    expect(ledger.repos.update(repo.id, {})).toEqual(repo);
    expect(ledger.repos.update(repo.id, { path: repo.path, name: repo.name })).toEqual(repo);
    expect(ledger.events.latestId()).toBe(latest);
  });
});
