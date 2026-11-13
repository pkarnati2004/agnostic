import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangesResponse, Repo, Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { commitLines, gitIn, repoWithConfig, startTask } from "../test-task-run.js";

let daemon: TestDaemon;
let repo: Repo;
let task: Task;
let worktree = "";

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
  task = await startTask(daemon, repo);
  worktree = task.worktreePath ?? "";
});

afterEach(() => daemon.close());

async function changes(): Promise<ChangesResponse> {
  const response = await daemon.request(`/tasks/${task.id}/changes`);
  expect(response.status).toBe(200);
  return (await response.json()) as ChangesResponse;
}

async function rev(cwd: string, ref: string): Promise<string> {
  return (await gitIn(cwd, ["rev-parse", ref])).stdout.trim();
}

/** The task's branch merged into main with a merge commit, the way a pull request lands. */
async function mergeIntoMain(): Promise<string> {
  await commitLines(worktree, 2);
  await gitIn(repo.path, ["merge", "-q", "--no-ff", "-m", "merge the task", task.branch ?? ""]);
  return rev(repo.path, "main");
}

/** The merge is on origin only: local main is put back where it was, as a fetch leaves it. */
async function mergeOnOriginOnly(): Promise<string> {
  const cut = await rev(repo.path, "main");
  const merge = await mergeIntoMain();
  await gitIn(repo.path, ["update-ref", "refs/remotes/origin/main", merge]);
  await gitIn(repo.path, ["reset", "-q", "--hard", cut]);
  return merge;
}

describe("GET /tasks/:id/changes after a merge", () => {
  it("reads a branch merged into local main as merged, with nothing listed", async () => {
    await gitIn(repo.path, [
      "update-ref",
      "refs/remotes/origin/main",
      await rev(repo.path, "main"),
    ]);
    await mergeIntoMain();
    const body = await changes();
    expect(body).toMatchObject({ merged: true, ahead: 0, behind: 1, files: [] });
  });

  it("does not read a branch with no commits yet as merged", async () => {
    const body = await changes();
    expect(body.merged).toBe(false);
    expect(body.files).toEqual([]);
  });

  it("takes origin/main when the merge is only there and the worktree was brought onto it", async () => {
    const merge = await mergeOnOriginOnly();
    await gitIn(worktree, ["merge", "-q", "--ff-only", merge]);
    const body = await changes();
    expect(body).toMatchObject({ merged: true, ahead: 0, behind: 0, files: [] });
    expect(body.base.commit).toBe(merge);
  });

  it("lists an edit left in a merged worktree under unstaged", async () => {
    const merge = await mergeOnOriginOnly();
    await gitIn(worktree, ["merge", "-q", "--ff-only", merge]);
    await writeFile(join(worktree, "agent.txt"), "left over\n");
    const body = await changes();
    expect(body.merged).toBe(true);
    expect(body.uncommitted).toBe(1);
    expect(body.files).toMatchObject([{ path: "agent.txt", state: "unstaged" }]);
  });

  it("judges against local main when it has diverged from origin/main", async () => {
    const merge = await mergeOnOriginOnly();
    await commitLines(repo.path, 1, "local.txt");
    await gitIn(worktree, ["merge", "-q", "--ff-only", merge]);
    const body = await changes();
    expect(body.merged).toBe(false);
    expect(body.base.commit).toBe(task.baseCommit);
    expect(body.ahead).toBe(2);
  });

  it("reads a branch fast-forwarded onto the merge in local main as merged, ahead 0 and behind 0", async () => {
    const merge = await mergeIntoMain();
    await gitIn(worktree, ["merge", "-q", "--ff-only", merge]);
    expect(await changes()).toMatchObject({ merged: true, ahead: 0, behind: 0, files: [] });
  });

  it("reads a task with no commits of its own as merged once its branch sits on a newer base (the known reading)", async () => {
    await commitLines(repo.path, 1, "other.txt");
    await gitIn(worktree, ["merge", "-q", "--ff-only", "main"]);
    const body = await changes();
    expect(body.merged).toBe(true);
    expect(body.ahead).toBe(0);
  });

  it("does not read a branch whose tip is the base commit as merged", async () => {
    expect(await rev(worktree, "HEAD")).toBe(task.baseCommit);
    expect((await changes()).merged).toBe(false);
  });
});
