import {
  CLOSED_STATUSES,
  errorMessage,
  isClosed,
  isDirectory,
  type Outcome,
  type Repo,
  type RepoConfig,
  readRepoConfig,
  type Task,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import {
  type BranchFacts,
  detectVerdict,
  readBranchFacts,
  type Verdict,
} from "./branch-verdict.js";
import { taskClosedAt } from "./task-duration.js";
import { unsavedWork } from "./worktree-unsaved.js";

/** All a verdict needs: the rows, the worktree, and somewhere to say a git call went wrong. */
type VerdictDeps = Pick<DaemonContext, "ledger" | "executor" | "log">;

export type VerdictSweep = {
  /** Every terminal task whose branch could still be merged or thrown away. */
  runOnce(): Promise<void>;
  close(): void;
};

/**
 * Rereads one task's branch and records what it finds. Accepted is final; a branch that is merged
 * after it was cleaned flips from reverted to accepted the next time this runs (ADR 022).
 */
export async function refreshVerdict(deps: VerdictDeps, task: Task): Promise<Outcome | null> {
  const outcome = deps.ledger.outcomes.get(task.id);
  // A live task has no verdict to read yet: its tests-before row is a baseline, not a result. It
  // is also why the sweep never cleans a worktree a resume rebuilt from under its agent (ADR 031).
  if (!isClosed(task.status)) {
    return outcome;
  }
  if (outcome === null || task.branch === null || task.baseCommit === null) {
    return outcome;
  }
  const repo = deps.ledger.repos.get(task.repoId);
  // A removed repo's worktrees were deleted on purpose, so re-reading its branches would turn
  // every task that was not merged into a reverted one: the verdicts freeze where they were.
  if (repo === null || repo.status === "removed" || !(await isDirectory(repo.path))) {
    deps.log.warn("verdict not checked: the repo is gone", { taskId: task.id });
    return outcome;
  }
  const config = await readRepoConfig(repo.path);
  const closedAt = taskClosedAt(deps.ledger.events.forTask(task.id)) ?? task.updatedAt;
  const facts = await readBranchFacts(repo.path, task, closedAt);
  const verdict = await detectVerdict(repo.path, config?.baseBranch ?? "HEAD", task, facts);
  const updated = merge(outcome, facts, verdict);
  const recorded = same(outcome, updated) ? outcome : deps.ledger.outcomes.record(updated);
  await cleanIfMerged(deps, repo, task, config, { accepted: verdict.accepted, facts });
  return recorded;
}

/**
 * The timer that keeps verdicts current without anyone asking. Five minutes and unref'd: it is
 * bookkeeping, and it must never be the reason a daemon stays alive. A null interval is a sweep
 * a test drives by hand.
 */
export function createVerdictSweep(deps: VerdictDeps, intervalMs: number | null): VerdictSweep {
  const runOnce = async (): Promise<void> => {
    for (const task of pending(deps)) {
      // One unreadable repo must not stop the sweep over the others.
      await refreshVerdict(deps, task).catch((cause: unknown) => {
        deps.log.error("outcome not recorded", { taskId: task.id, message: errorMessage(cause) });
      });
    }
  };
  const timer =
    intervalMs === null
      ? null
      : setInterval(() => {
          void runOnce();
        }, intervalMs);
  timer?.unref();
  return {
    runOnce,
    close: () => {
      if (timer !== null) {
        clearInterval(timer);
      }
    },
  };
}

/** Tasks that ran on a branch, have closed, and have no final verdict yet. */
function pending(deps: VerdictDeps): Task[] {
  return deps.ledger.tasks
    .list({ status: CLOSED_STATUSES })
    .filter((task) => task.branch !== null && task.baseCommit !== null)
    .filter((task) => deps.ledger.outcomes.get(task.id)?.accepted === false);
}

/**
 * `clean_after_merge`: the worktree of merged work is disk nobody needs. The branch stays, as it
 * does for `agn clean` (ADR 013), and the removal is recorded so the row still says what ran.
 * Nothing a person has not committed is thrown away on a timer; `agn clean --force` still forces it.
 */
async function cleanIfMerged(
  deps: VerdictDeps,
  repo: Repo,
  task: Task,
  config: RepoConfig | null,
  found: { accepted: boolean; facts: BranchFacts },
): Promise<void> {
  const worktree = found.facts.worktreeExists ? task.worktreePath : null;
  if (!found.accepted || config?.cleanAfterMerge !== true || worktree === null) {
    return;
  }
  const unsaved = await unsavedWork(worktree);
  if (unsaved !== null) {
    deps.log.info("worktree kept after merge", { taskId: task.id, reason: unsaved });
    return;
  }
  await deps.executor.clean({ task, repo, deleteBranch: false });
  deps.ledger.tasks.clean(task.id, false);
  deps.log.info("worktree cleaned after merge", { taskId: task.id });
}

function merge(outcome: Outcome, facts: BranchFacts, verdict: Verdict): Outcome {
  const agentLines = facts.agentLines ?? outcome.agentLines;
  return {
    ...outcome,
    accepted: verdict.accepted,
    reverted: verdict.reverted,
    agentLines,
    humanChangedLines: verdict.humanChangedLines ?? outcome.humanChangedLines,
    humanEditRatio: ratio(agentLines, verdict.humanChangedLines ?? outcome.humanChangedLines),
  };
}

/** Null when there is nothing to divide by: a branch with no agent lines has no ratio. */
function ratio(agentLines: number | null, humanChangedLines: number | null): number | null {
  if (agentLines === null || agentLines === 0 || humanChangedLines === null) {
    return null;
  }
  return humanChangedLines / agentLines;
}

function same(before: Outcome, after: Outcome): boolean {
  return (
    before.accepted === after.accepted &&
    before.reverted === after.reverted &&
    before.agentLines === after.agentLines &&
    before.humanChangedLines === after.humanChangedLines &&
    before.humanEditRatio === after.humanEditRatio
  );
}
