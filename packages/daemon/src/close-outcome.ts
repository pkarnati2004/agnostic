import { type Outcome, type Repo, readRepoConfig, type Task, taskLogPath } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { type BranchFacts, readBranchFacts } from "./branch-verdict.js";
import { taskClosedAt, taskDuration } from "./task-duration.js";
import { runTestCommand } from "./test-command.js";

/**
 * The tests as they stood before the agent touched anything, written as soon as they are known so
 * a daemon that restarts mid-task still has the baseline (ADR 022). The row is completed at close.
 */
export function recordTestsBefore(ctx: DaemonContext, task: Task, passed: boolean | null): void {
  if (passed === null) {
    return;
  }
  ctx.ledger.outcomes.record({
    taskId: task.id,
    testsBefore: passed,
    testsAfter: null,
    accepted: null,
    reverted: null,
    agentLines: null,
    humanChangedLines: null,
    humanEditRatio: null,
    durationSec: 0,
    costUsd: null,
    tokens: 0,
    resolvedModel: null,
  });
}

/**
 * One row per closed task: how long it ran, what it cost, what its tests say and how much it
 * wrote. Called once the harness is gone, so the test command has the worktree to itself and the
 * usage rows for the last turn are already in. The verdict starts open and the sweep keeps it
 * current; nothing here decides whether the work was kept.
 */
export async function closeOutcome(ctx: DaemonContext, task: Task): Promise<Outcome> {
  const events = ctx.ledger.events.forTask(task.id);
  const closedAt = taskClosedAt(events) ?? new Date().toISOString();
  const repo = ctx.ledger.repos.get(task.repoId);
  const usage = ctx.ledger.usage.sumForTask(task.id);
  return ctx.ledger.outcomes.record({
    taskId: task.id,
    testsBefore: ctx.ledger.outcomes.get(task.id)?.testsBefore ?? null,
    testsAfter: await testsAfter(ctx, repo, task),
    ...diff(task, repo === null ? null : await readBranchFacts(repo.path, task, closedAt)),
    durationSec: taskDuration(events, closedAt),
    costUsd: usage.costUsd,
    tokens: usage.tokens,
    resolvedModel: ctx.ledger.usage.latestModelForTask(task.id),
  });
}

/** In the directory the harness ran in, which is the repo itself for a folder or adopted task. */
async function testsAfter(
  ctx: DaemonContext,
  repo: Repo | null,
  task: Task,
): Promise<boolean | null> {
  if (repo === null) {
    return null;
  }
  const config = await readRepoConfig(repo.path);
  return await runTestCommand({
    command: config?.testCommand ?? null,
    cwd: task.session?.cwd ?? task.worktreePath ?? repo.path,
    logFile: taskLogPath(ctx.paths, task.id),
    log: ctx.log,
  });
}

type Diff = Pick<
  Outcome,
  "accepted" | "reverted" | "agentLines" | "humanChangedLines" | "humanEditRatio"
>;

const NO_DIFF: Diff = {
  accepted: null,
  reverted: null,
  agentLines: null,
  humanChangedLines: null,
  humanEditRatio: null,
};

/**
 * A folder task and an adopted one have no branch of agn's to measure, so their diff fields stay
 * null rather than claiming a zero. At close nobody has reviewed anything yet: no human lines.
 */
function diff(task: Task, facts: BranchFacts | null): Diff {
  if (facts === null || task.branch === null || task.baseCommit === null) {
    return NO_DIFF;
  }
  return {
    accepted: false,
    reverted: false,
    agentLines: facts.agentLines,
    humanChangedLines: 0,
    humanEditRatio: facts.agentLines === null || facts.agentLines === 0 ? null : 0,
  };
}
