import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgnosticPaths, agnosticPaths, newId, type Repo } from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DaemonContext } from "./app.js";
import { removeRepo } from "./remove-repo.js";

let home: string;
let workspace: string;
let ledger: Ledger;
let paths: AgnosticPaths;

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), "agn-home-")));
  workspace = await realpath(await mkdtemp(join(tmpdir(), "agn-work-")));
  paths = agnosticPaths(home);
  ledger = openLedger(paths.db);
});

afterEach(async () => {
  ledger.close();
  await rm(home, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

/** Only what removeRepo reads: the ledger, the paths, and a reconcile that finds nothing live. */
function context(): DaemonContext {
  return {
    ledger,
    paths,
    lifecycle: { reconcileAll: () => Promise.resolve() },
  } as unknown as DaemonContext;
}

async function addRepo(name: string): Promise<Repo> {
  const path = join(workspace, name);
  await mkdir(path, { recursive: true });
  return ledger.repos.insert({
    id: newId(),
    path,
    kind: "git",
    name,
    addedAt: new Date().toISOString(),
    status: "active",
  });
}

describe("removeRepo", () => {
  it("counts and deletes the task worktrees made by hand under the repo's own directory", async () => {
    const repo = await addRepo("alpha");
    const root = join(paths.worktrees, repo.id);
    await mkdir(join(root, "t1"), { recursive: true });
    await mkdir(join(root, "t2"), { recursive: true });

    const result = await removeRepo(context(), repo);
    expect(result).toMatchObject({ repo: { status: "removed" }, worktreesRemoved: 2 });
    await expect(realpath(root)).rejects.toThrow();
  });

  it("answers 0 when the repo never had a worktree directory", async () => {
    const repo = await addRepo("alpha");
    const result = await removeRepo(context(), repo);
    expect(result.worktreesRemoved).toBe(0);
    expect(result.repo.status).toBe("removed");
  });

  it("removes a repo whose own path is already gone, leaving the workspace's other directories alone", async () => {
    const repo = await addRepo("alpha");
    const sibling = join(workspace, "beta");
    await mkdir(sibling, { recursive: true });
    await rm(repo.path, { recursive: true, force: true });

    const result = await removeRepo(context(), repo);
    expect(result.repo.status).toBe("removed");
    await expect(realpath(sibling)).resolves.toBeTruthy();
  });

  it("never deletes the repo's own directory, only its worktrees", async () => {
    const repo = await addRepo("alpha");
    await mkdir(join(paths.worktrees, repo.id, "t1"), { recursive: true });

    await removeRepo(context(), repo);
    await expect(realpath(repo.path)).resolves.toBeTruthy();
  });
});
