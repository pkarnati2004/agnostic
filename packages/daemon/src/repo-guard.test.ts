import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Repo } from "@agnostic/core";
import * as core from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { assertRepoUsable } from "./repo-guard.js";

const OPEN: Repo = {
  id: "r7k2m4pqrs",
  path: "/work/api",
  kind: "git",
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active",
};

/** A real directory this test makes and removes itself; the guard is asked to stat no stub. */
async function realDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agn-guard-"));
}

describe("assertRepoUsable", () => {
  it("lets an open repo whose folder is there through", async () => {
    await expect(assertRepoUsable({ ...OPEN, path: tmpdir() })).resolves.toBeUndefined();
  });

  it("refuses a closed one, naming the repo and the command that opens it", async () => {
    const closed = { ...OPEN, status: "archived" as const };
    await expect(assertRepoUsable(closed)).rejects.toThrowError("repo api is closed");
    await expect(assertRepoUsable(closed)).rejects.toThrowError(
      expect.objectContaining({
        code: "repo-closed",
        hint: "Run `agn repo open r7k2m4pqrs` first.",
      }),
    );
  });

  it("refuses a removed one, naming the repo and the agn add hint", async () => {
    const removed = { ...OPEN, status: "removed" as const };
    await expect(assertRepoUsable(removed)).rejects.toThrowError(
      expect.objectContaining({
        code: "repo-removed",
        message: "repo api was removed",
        hint: "Run `agn add /work/api` to register it again.",
      }),
    );
  });

  it("refuses a folder that is not there, naming the path", async () => {
    const dir = await realDir();
    await rm(dir, { recursive: true, force: true });
    const gone = { ...OPEN, path: dir };
    await expect(assertRepoUsable(gone)).rejects.toThrowError(
      expect.objectContaining({
        code: "repo-missing",
        message: `the folder for repo api is not there: ${dir}`,
        hint: `Mount or restore it, or run \`agn repo remove ${OPEN.id}\`.`,
      }),
    );
  });

  it("lets it through again once the folder is back", async () => {
    const dir = await realDir();
    await rm(dir, { recursive: true, force: true });
    const gone = { ...OPEN, path: dir };
    await expect(assertRepoUsable(gone)).rejects.toThrowError(
      expect.objectContaining({ code: "repo-missing" }),
    );

    await mkdir(dir, { recursive: true });
    await expect(assertRepoUsable(gone)).resolves.toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });

  it("checks removed before closed, and closed before the folder", async () => {
    const dir = await realDir();
    await rm(dir, { recursive: true, force: true });
    const removedAndGone = { ...OPEN, path: dir, status: "removed" as const };
    await expect(assertRepoUsable(removedAndGone)).rejects.toThrowError(
      expect.objectContaining({ code: "repo-removed" }),
    );

    const closedAndGone = { ...OPEN, path: dir, status: "archived" as const };
    await expect(assertRepoUsable(closedAndGone)).rejects.toThrowError(
      expect.objectContaining({ code: "repo-closed" }),
    );
  });

  it("never starts a process to answer any of this", async () => {
    const runSpy = vi.spyOn(core, "run");
    const spawnSpy = vi.spyOn(core, "spawn");
    const dir = await realDir();
    await rm(dir, { recursive: true, force: true });

    await assertRepoUsable({ ...OPEN, path: tmpdir() });
    await expect(assertRepoUsable({ ...OPEN, path: dir })).rejects.toThrow();
    await expect(assertRepoUsable({ ...OPEN, status: "removed" as const })).rejects.toThrow();
    await expect(assertRepoUsable({ ...OPEN, status: "archived" as const })).rejects.toThrow();

    expect(runSpy).not.toHaveBeenCalled();
    expect(spawnSpy).not.toHaveBeenCalled();
    runSpy.mockRestore();
    spawnSpy.mockRestore();
  });
});
