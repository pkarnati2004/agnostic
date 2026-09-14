import type { Outcome, TaskClass } from "@agnostic/core";

/** What this repo has already seen: one row per finished task that has an outcome recorded. */
export type HistoryRow = { taskClass: TaskClass; profileId: string; outcome: Outcome };

/** How this repo's own results turned out for one profile, and how many tasks say so. */
export type HistoryEvidence = { kept: number; tasks: number };

/** Below this, a repo's own numbers say less than the catalog does (ARCHITECTURE §6). */
const MIN_OUTCOMES = 30;

/** A profile nobody has run often enough here is scored on the catalog, like an unknown one. */
const MIN_VERDICTS = 5;

/**
 * The repo's own evidence for a profile on this kind of task, 0 to 1, which outranks the catalog
 * once there is enough of it. Kept work is work that was merged and left alone: an accepted task
 * scores 1 minus the share of its lines a reviewer had to change, and anything else scores 0.
 * Null is "not enough to say" - fewer than thirty tasks of this class here, or fewer than five
 * verdicts for this profile.
 */
export function historyEvidence(
  history: HistoryRow[],
  taskClass: TaskClass,
  profileId: string,
): HistoryEvidence | null {
  const onClass = history.filter((row) => row.taskClass.intent === taskClass.intent);
  if (onClass.length < MIN_OUTCOMES) {
    return null;
  }
  // A row with no verdict ran in a folder or was adopted: it says nothing about what was kept.
  const verdicts = onClass
    .filter((row) => row.profileId === profileId && row.outcome.accepted !== null)
    .map((row) => row.outcome);
  if (verdicts.length < MIN_VERDICTS) {
    return null;
  }
  const total = verdicts.reduce((sum, outcome) => sum + keptShare(outcome), 0);
  return { kept: total / verdicts.length, tasks: verdicts.length };
}

function keptShare(outcome: Outcome): number {
  if (outcome.accepted !== true) {
    return 0;
  }
  // A reviewer who rewrote more lines than the agent wrote kept none of it.
  return 1 - Math.min(1, outcome.humanEditRatio ?? 0);
}
