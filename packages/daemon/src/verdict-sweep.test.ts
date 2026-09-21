import { rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Repo } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { closedTask, commitLines, gitIn, repoWithConfig } from "./test-task-run.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** The verdict recheck an accepted task still gets: `agn outcomes` reads it, the sweep skips it. */
async function recheck(taskId: string): Promise<void> {
  expect((await daemon.request(`/tasks/${taskId}/outcome`)).status).toBe(200);
}

function cleanedEvents(taskId: string) {
  return daemon.ledger.events.forTask(taskId).filter((event) => event.kind === "task.cleaned");
}

describe("the verdict of a closed task", () => {
  it("is accepted once the branch is merged, and stays open until then", async () => {
    const repo = await repoWithConfig(daemon);
    const { task, outcome } = await closedTask(daemon, repo, 10);
    expect(outcome.accepted).toBe(false);
    expect(outcome.reverted).toBe(false);

    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);
    await daemon.verdicts.runOnce();

    const merged = daemon.ledger.outcomes.get(task.id);
    expect(merged?.accepted).toBe(true);
    expect(merged?.reverted).toBe(false);
  });

  it("is accepted after a squash merge, where the branch is nobody's ancestor", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);

    await gitIn(repo.path, ["merge", "--squash", task.branch ?? ""]);
    await gitIn(repo.path, ["commit", "-q", "-m", "squashed"]);
    await daemon.verdicts.runOnce();

    expect(daemon.ledger.outcomes.get(task.id)?.accepted).toBe(true);
  });

  it("is reverted when the branch is deleted after the worktree was cleaned", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);

    const response = await daemon.request(`/tasks/${task.id}/clean`, { method: "POST" });
    expect(response.status).toBe(200);
    await gitIn(repo.path, ["branch", "-D", task.branch ?? ""]);
    await daemon.verdicts.runOnce();

    const outcome = daemon.ledger.outcomes.get(task.id);
    expect(outcome?.reverted).toBe(true);
    expect(outcome?.accepted).toBe(false);
  });

  it("is reverted by a clean alone, and flips to accepted if the branch is merged later", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);

    await daemon.request(`/tasks/${task.id}/clean`, { method: "POST" });
    await daemon.verdicts.runOnce();
    expect(daemon.ledger.outcomes.get(task.id)?.reverted).toBe(true);

    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);
    await daemon.verdicts.runOnce();
    expect(daemon.ledger.outcomes.get(task.id)?.accepted).toBe(true);
  });

  it("counts commits made on the branch after the task closed as the reviewer's", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);

    // git records commit times in whole seconds, so a reviewer who commits inside the same second
    // as the close cannot be told from the agent. A real review is not this fast.
    await new Promise((done) => setTimeout(done, 1_100));
    await commitLines(task.worktreePath ?? "", 5, "reviewer.txt");
    await daemon.verdicts.runOnce();

    const outcome = daemon.ledger.outcomes.get(task.id);
    expect(outcome?.agentLines).toBe(10);
    expect(outcome?.humanChangedLines).toBe(5);
    expect(outcome?.humanEditRatio).toBe(0.5);
    // Nobody merged anything: reviewing a branch is not accepting it.
    expect(outcome?.accepted).toBe(false);
  });

  it("leaves a task with no commits open until its worktree goes", async () => {
    const repo = await repoWithConfig(daemon);
    const { task, outcome } = await closedTask(daemon, repo, 0);
    expect(outcome.agentLines).toBe(0);
    await daemon.verdicts.runOnce();
    expect(daemon.ledger.outcomes.get(task.id)?.reverted).toBe(false);

    await daemon.request(`/tasks/${task.id}/clean`, { method: "POST" });
    await daemon.verdicts.runOnce();
    expect(daemon.ledger.outcomes.get(task.id)?.reverted).toBe(true);
  });

  it("removes the worktree of merged work once, when the repo asks for it", async () => {
    const repo = await repoWithConfig(daemon, { cleanAfterMerge: true });
    const { task } = await closedTask(daemon, repo, 10);
    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);

    await daemon.verdicts.runOnce();

    expect(await exists(task.worktreePath ?? "")).toBe(false);
    expect(cleanedEvents(task.id)).toHaveLength(1);
    expect(cleanedEvents(task.id)[0]?.payload).toEqual({ deletedBranch: false });
    // The branch is the work; only the checkout of it was disposable (ADR 013).
    const branches = await gitIn(repo.path, ["branch", "--list", task.branch ?? ""]);
    expect(branches.stdout).toContain(task.branch ?? "");

    await daemon.verdicts.runOnce();
    expect(cleanedEvents(task.id)).toHaveLength(1);
  });

  it("keeps a worktree with uncommitted work, however merged the branch is", async () => {
    const repo = await repoWithConfig(daemon, { cleanAfterMerge: true });
    const { task } = await closedTask(daemon, repo, 10);
    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);
    await writeFile(join(task.worktreePath ?? "", "notes.txt"), "half an idea\n");

    await daemon.verdicts.runOnce();

    expect(await exists(task.worktreePath ?? "")).toBe(true);
    expect(cleanedEvents(task.id)).toHaveLength(0);
    expect(await daemon.readLog()).toContain("worktree kept after merge");
  });

  it("sweeps a worktree a resume rebuilt the way it swept the first one", async () => {
    const repo = await repoWithConfig(daemon, { cleanAfterMerge: true });
    const { task } = await closedTask(daemon, repo, 10);
    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);
    await daemon.verdicts.runOnce();
    expect(await exists(task.worktreePath ?? "")).toBe(false);

    const resumed = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
    expect(resumed.status).toBe(200);
    // An accepted task is final to the sweep, so the recheck that still runs is the outcome read;
    // it returns before reading anything while the task is live, worktree and all.
    await recheck(task.id);
    expect(await exists(task.worktreePath ?? "")).toBe(true);
    expect(cleanedEvents(task.id)).toHaveLength(1);

    await writeFile(join(task.worktreePath ?? "", "notes.txt"), "half an idea\n");
    expect((await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" })).status).toBe(200);
    await recheck(task.id);
    expect(await exists(task.worktreePath ?? "")).toBe(true);
    expect(await daemon.readLog()).toContain("worktree kept after merge");

    await rm(join(task.worktreePath ?? "", "notes.txt"));
    await recheck(task.id);
    expect(await exists(task.worktreePath ?? "")).toBe(false);
    expect(cleanedEvents(task.id)).toHaveLength(2);
  });

  it("re-records nothing when a second sweep finds the branch exactly as it left it", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);
    const closeEvents = daemon.ledger.events
      .forTask(task.id)
      .filter((event) => event.kind === "outcome.recorded").length;

    await daemon.verdicts.runOnce();
    await daemon.verdicts.runOnce();

    const events = daemon.ledger.events
      .forTask(task.id)
      .filter((event) => event.kind === "outcome.recorded");
    expect(events).toHaveLength(closeEvents);
  });

  it("leaves the worktree alone when the repo has not asked for it", async () => {
    const repo = await repoWithConfig(daemon);
    const { task } = await closedTask(daemon, repo, 10);
    await gitIn(repo.path, ["merge", "--no-ff", "-q", "-m", "merge", task.branch ?? ""]);

    await daemon.verdicts.runOnce();

    expect(await exists(task.worktreePath ?? "")).toBe(true);
    expect(cleanedEvents(task.id)).toHaveLength(0);
  });

  it("logs and moves on when the repo itself is gone", async () => {
    const repo = await repoWithConfig(daemon);
    const { task, outcome } = await closedTask(daemon, repo, 10);
    await rm(repo.path, { recursive: true, force: true });

    await daemon.verdicts.runOnce();

    expect(daemon.ledger.outcomes.get(task.id)).toEqual(outcome);
    expect(await daemon.readLog()).toContain("verdict not checked");
  });

  it("freezes a not-merged task's verdict once its repo is removed", async () => {
    const repo = await repoWithConfig(daemon);
    const { task, outcome } = await closedTask(daemon, repo, 10);
    expect(outcome.reverted).toBe(false);
    daemon.ledger.repos.update(repo.id, { status: "removed" });

    await daemon.verdicts.runOnce();

    expect(daemon.ledger.outcomes.get(task.id)).toEqual(outcome);
    expect(await daemon.readLog()).toContain("verdict not checked");
  });

  it("says nothing about a folder task, which has no branch to judge", async () => {
    const repo: Repo = await repoWithConfig(daemon, { git: false });
    const { task, outcome } = await closedTask(daemon, repo, 0);
    expect(outcome.accepted).toBeNull();

    await daemon.verdicts.runOnce();
    expect(daemon.ledger.outcomes.get(task.id)).toEqual(outcome);
  });
});
