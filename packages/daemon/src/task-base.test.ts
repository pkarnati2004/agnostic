import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HandoffTaskResponse, Repo, Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DaemonContext } from "./app.js";
import { resolveTaskBase } from "./task-base.js";
import { taskDir } from "./task-dir.js";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { acceptTask, gitIn, repoWithConfig, startTask } from "./test-task-run.js";

let daemon: TestDaemon;
let repo: Repo;
let ctx: DaemonContext;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
  // Both resolveTaskBase and taskDir read the ledger and nothing else of the context.
  ctx = { ledger: daemon.ledger } as unknown as DaemonContext;
});

afterEach(() => daemon.close());

function base(task: Task) {
  const row = daemon.ledger.tasks.get(task.id) ?? task;
  return taskDir(ctx, repo, row).then((at) => resolveTaskBase(ctx, repo, row, at));
}

async function commit(cwd: string, name: string): Promise<string> {
  await writeFile(join(cwd, name), `${name}\n`);
  await gitIn(cwd, ["add", name]);
  await gitIn(cwd, ["commit", "-q", "-m", name]);
  return (await gitIn(cwd, ["rev-parse", "HEAD"])).stdout;
}

describe("resolveTaskBase", () => {
  it("judges a task off the repo's own branch against that branch", async () => {
    const task = await startTask(daemon, repo);
    expect(await base(task)).toEqual({
      ref: "main",
      commit: task.baseCommit,
      baseTaskId: null,
    });
  });

  it("judges a task started from another task's branch against that branch", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    expect(await base(second)).toMatchObject({ ref: first.branch, baseTaskId: first.id });
  });

  it("reads the base branch again once the parent's work is accepted", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    acceptTask(daemon, first);
    expect(await base(second)).toMatchObject({ ref: "main", baseTaskId: null });
  });

  it("moves the diff base to the merge-base once the branch takes the base in", async () => {
    const task = await startTask(daemon, repo);
    const moved = await commit(repo.path, "later.ts");
    await commit(task.worktreePath ?? "", "agent.ts");
    await gitIn(task.worktreePath ?? "", ["merge", "-q", "--no-edit", "main"]);
    expect(await base(task)).toEqual({ ref: "main", commit: moved, baseTaskId: null });
  });

  it("carries a handoff child of a stacked task to its parent's answer", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    // Without a commit of its own, second's branch ties first's distance from the base commit,
    // and the newest-wins tiebreak would otherwise point back at the handoff's own child branch.
    await commit(second.worktreePath ?? "", "second.ts");

    const response = await daemon.request(`/tasks/${second.id}/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "codex" }),
    });
    expect(response.status).toBe(201);
    const { task: child } = (await response.json()) as HandoffTaskResponse;

    expect(child.parentTaskId).toBe(second.id);
    expect(await base(child)).toMatchObject({ ref: first.branch, baseTaskId: first.id });
  });

  it("keeps a handoff child of a stacked task off its own parent's answer", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    // No commit on second: its branch, first's and the child's all sit on the same commit, so
    // only leaving second's own children out of the candidates keeps the answer at first.
    const response = await daemon.request(`/tasks/${second.id}/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "codex" }),
    });
    expect(response.status).toBe(201);
    const { task: child } = (await response.json()) as HandoffTaskResponse;

    expect(await base(child)).toMatchObject({ ref: first.branch, baseTaskId: first.id });
  });

  it("takes the task started last when two branches sit on the same commit", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    const third = await startTask(daemon, repo, { base: second.id });

    // first's branch and second's are both at the same commit; second is the one third came from.
    expect(await base(third)).toMatchObject({ ref: second.branch, baseTaskId: second.id });
  });

  it("falls back to the base ref once the stacked parent's branch is merged in", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    // A real merge, not the outcome ledger's accepted flag: what GitHub does at merge time.
    await gitIn(repo.path, ["merge", "-q", "--no-edit", first.branch ?? ""]);

    expect(await base(second)).toMatchObject({ ref: "main", baseTaskId: null });
  });

  it("falls back to the base ref once the stacked parent's branch is deleted", async () => {
    const first = await startTask(daemon, repo);
    await commit(first.worktreePath ?? "", "first.ts");
    const second = await startTask(daemon, repo, { base: first.id });
    await daemon.request(`/tasks/${first.id}/stop`, { method: "POST" });
    await daemon.request(`/tasks/${first.id}/clean`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true, deleteBranch: true }),
    });

    expect(await base(second)).toMatchObject({ ref: "main", baseTaskId: null });
  });
});
