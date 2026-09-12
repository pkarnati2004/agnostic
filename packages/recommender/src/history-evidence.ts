import type { Outcome, TaskClass } from "@agnostic/core";

/** What this repo has already seen: one row per finished task that has an outcome recorded. */
export type HistoryRow = { taskClass: TaskClass; profileId: string; outcome: Outcome };

/** Below this, a repo's own numbers say less than the catalog does (ARCHITECTURE §6). */
const MIN_OUTCOMES = 30;

/**
 * The repo's own evidence for a profile on this kind of task, 0 to 1, which outranks the catalog
 * once there is enough of it. Null means "not enough to say", which is the only answer in v0.
 */
export function historyEvidence(
  history: HistoryRow[],
  taskClass: TaskClass,
  profileId: string,
): number | null {
  const rows = history.filter(
    (row) => row.profileId === profileId && row.taskClass.intent === taskClass.intent,
  );
  if (rows.length < MIN_OUTCOMES) {
    return null;
  }
  // chunk 15 turns accepted, reverted and the human edit ratio into the score; until it does, a
  // repo with a long history is still scored on the catalog rather than on a metric agn made up.
  return null;
}
