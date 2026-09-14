import { type Outcome, OutcomeSchema } from "@agnostic/core";
import type { Database } from "better-sqlite3";
import { LedgerError, rowInvalid, writeFailure } from "./error.js";
import type { EventQueries } from "./event-queries.js";

type OutcomeRow = {
  task_id: string;
  tests_before: number | null;
  tests_after: number | null;
  accepted: number | null;
  reverted: number | null;
  agent_lines: number | null;
  human_changed_lines: number | null;
  human_edit_ratio: number | null;
  duration_sec: number;
  cost_usd: number | null;
  tokens: number;
  resolved_model: string | null;
};

export type OutcomeQueries = {
  /** An upsert: the human edit ratio only arrives once someone has reviewed the diff. */
  record(outcome: Outcome): Outcome;
  get(taskId: string): Outcome | null;
  /**
   * What the repo's test command said about this commit when another task last ran it, so a task
   * starting from a commit agn has already tested launches without running it again (ADR 022).
   * Null is "nothing recorded", never "the tests failed".
   */
  testedAtCommit(repoId: string, baseCommit: string): boolean | null;
};

const COLUMNS =
  "task_id, tests_before, tests_after, accepted, reverted, agent_lines, human_changed_lines, human_edit_ratio, duration_sec, cost_usd, tokens, resolved_model, recorded_at";

export function createOutcomeQueries(db: Database, events: EventQueries): OutcomeQueries {
  const selectByTask = db.prepare("SELECT * FROM outcomes WHERE task_id = ?");
  const selectTested = db.prepare(
    `SELECT outcomes.tests_before AS tests_before FROM outcomes
       JOIN tasks ON tasks.id = outcomes.task_id
      WHERE tasks.repo_id = ? AND tasks.base_commit = ? AND outcomes.tests_before IS NOT NULL
      ORDER BY outcomes.recorded_at DESC LIMIT 1`,
  );

  return {
    record: recordOutcome(db, events),
    get(taskId: string): Outcome | null {
      const row = selectByTask.get(taskId) as OutcomeRow | undefined;
      return row === undefined ? null : toOutcome(row);
    },
    testedAtCommit(repoId: string, baseCommit: string): boolean | null {
      const row = selectTested.get(repoId, baseCommit) as { tests_before: number } | undefined;
      return row === undefined ? null : row.tests_before !== 0;
    },
  };
}

function recordOutcome(db: Database, events: EventQueries): OutcomeQueries["record"] {
  const upsertRow = db.prepare(
    `INSERT INTO outcomes (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(task_id) DO UPDATE SET
       tests_before = excluded.tests_before, tests_after = excluded.tests_after,
       accepted = excluded.accepted, reverted = excluded.reverted,
       agent_lines = excluded.agent_lines, human_changed_lines = excluded.human_changed_lines,
       human_edit_ratio = excluded.human_edit_ratio, duration_sec = excluded.duration_sec,
       cost_usd = excluded.cost_usd, tokens = excluded.tokens,
       resolved_model = excluded.resolved_model, recorded_at = excluded.recorded_at`,
  );
  return db.transaction((outcome: Outcome): Outcome => {
    const recordedAt = new Date().toISOString();
    try {
      upsertRow.run(
        outcome.taskId,
        toInteger(outcome.testsBefore),
        toInteger(outcome.testsAfter),
        toInteger(outcome.accepted),
        toInteger(outcome.reverted),
        outcome.agentLines,
        outcome.humanChangedLines,
        outcome.humanEditRatio,
        outcome.durationSec,
        outcome.costUsd,
        outcome.tokens,
        outcome.resolvedModel,
        recordedAt,
      );
    } catch (cause) {
      throw writeFailure(cause, {
        "foreign-key": () =>
          new LedgerError(`no task with id ${outcome.taskId}`, {
            code: "task-not-found",
            hint: "An outcome belongs to a task agn already knows about.",
            cause,
          }),
      });
    }
    events.append({
      ts: recordedAt,
      taskId: outcome.taskId,
      kind: "outcome.recorded",
      payload: { outcome },
    });
    return outcome;
  });
}

function toInteger(value: boolean | null): number | null {
  return value === null ? null : Number(value);
}

function toBoolean(value: number | null): boolean | null {
  return value === null ? null : value !== 0;
}

function toOutcome(row: OutcomeRow): Outcome {
  const parsed = OutcomeSchema.safeParse({
    taskId: row.task_id,
    testsBefore: toBoolean(row.tests_before),
    testsAfter: toBoolean(row.tests_after),
    accepted: toBoolean(row.accepted),
    reverted: toBoolean(row.reverted),
    agentLines: row.agent_lines,
    humanChangedLines: row.human_changed_lines,
    humanEditRatio: row.human_edit_ratio,
    durationSec: row.duration_sec,
    costUsd: row.cost_usd,
    tokens: row.tokens,
    resolvedModel: row.resolved_model,
  });
  if (!parsed.success) {
    throw rowInvalid("outcomes", parsed.error);
  }
  return parsed.data;
}
