import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Repo, Task } from "@agnostic/core";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "./ledger.js";

const repo: Repo = {
  id: "r7k2m4pqrs",
  path: "/Users/dev/code/agnostic",
  kind: "git",
  name: "agnostic",
  addedAt: "2026-09-10T11:00:00.000Z",
};

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: repo.id,
  title: "Split the recommender scoring out of the daemon",
  prompt: "Move scoring into packages/recommender.",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: null,
  branch: null,
  status: "queued",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
};

const open: Ledger[] = [];

function ledgerAt(path: string): Ledger {
  const ledger = openLedger(path);
  open.push(ledger);
  return ledger;
}

function seeded(): Ledger {
  const ledger = ledgerAt(":memory:");
  ledger.repos.insert(repo);
  ledger.tasks.insert(task);
  return ledger;
}

afterEach(() => {
  for (const ledger of open.splice(0)) {
    ledger.close();
  }
});

describe("openLedger", () => {
  it("creates the parent directory and the file, and applies every migration", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agnostic-ledger-")), "nested", "agnostic.db");
    const ledger = ledgerAt(path);
    expect(ledger.path).toBe(path);
    expect(existsSync(path)).toBe(true);

    const db = new Database(path, { readonly: true });
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.prepare("SELECT version, name FROM schema_version ORDER BY version").all()).toEqual([
      { version: 1, name: "initial" },
      { version: 2, name: "task-base-commit" },
    ]);
    db.close();
  });

  it("turns foreign keys on", () => {
    const ledger = ledgerAt(":memory:");
    ledger.repos.insert(repo);
    expect(() => ledger.tasks.insert({ ...task, repoId: "z9z9z9z9z9" })).toThrowError(
      expect.objectContaining({ code: "repo-not-found" }),
    );
  });

  it("reopens an existing file without applying anything and keeps the rows", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agnostic-ledger-")), "agnostic.db");
    const first = ledgerAt(path);
    first.repos.insert(repo);
    first.close();

    const second = ledgerAt(path);
    expect(second.repos.list()).toEqual([repo]);
    expect(second.events.latestId()).toBe(1);
  });

  it("reports a path it cannot open", () => {
    const directory = mkdtempSync(join(tmpdir(), "agnostic-ledger-"));
    expect(() => openLedger(directory)).toThrowError(
      expect.objectContaining({ code: "ledger-open-failed" }),
    );
  });
});

describe("ledger.transaction", () => {
  it("rolls the row and its event back together", () => {
    const ledger = seeded();
    const before = ledger.events.latestId();
    expect(() =>
      ledger.transaction(() => {
        ledger.tasks.setStatus(task.id, "running");
        throw new Error("x");
      }),
    ).toThrow("x");
    expect(ledger.tasks.get(task.id)?.status).toBe("queued");
    expect(ledger.events.latestId()).toBe(before);
  });

  it("commits once when a transaction nests", () => {
    const ledger = seeded();
    ledger.transaction(() => {
      ledger.tasks.setStatus(task.id, "running");
      ledger.transaction(() => ledger.tasks.setStatus(task.id, "waiting"));
    });
    expect(ledger.tasks.get(task.id)?.status).toBe("waiting");
    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "task.status",
      "task.status",
    ]);
  });
});
