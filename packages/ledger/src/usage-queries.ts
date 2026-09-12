import {
  type Event,
  type HarnessId,
  HarnessIdSchema,
  type UsageBreakdown,
  type UsageSum,
} from "@agnostic/core";
import type { Database } from "better-sqlite3";
import { rowInvalid } from "./error.js";
import type { EventQueries } from "./event-queries.js";

export type UsageRecord = {
  id: number;
  ts: string;
  taskId: string | null;
  harness: HarnessId;
  model: string | null;
  // Pricing is per bucket, so cost stays derivable from what was stored.
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensCacheRead: number | null;
  tokensCacheWrite: number | null;
  tokens: number;
  costUsd: number | null;
  source: "transcript" | "hook";
  /** Identifies the transcript entry a row came from, so a rescan inserts nothing. */
  ref: string | null;
};

type SumRow = {
  tokens: number;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_cache_read: number | null;
  tokens_cache_write: number | null;
  cost_usd: number | null;
};

type BreakdownRow = SumRow & { harness: string; model: string | null; attributed: number };

export type UsageInput = Omit<UsageRecord, "id" | "taskId">;

export type UsageQueries = {
  record(
    taskId: string | null,
    rows: UsageInput[],
  ): { inserted: number; event: Event<"usage.recorded"> | null };
  sumForTask(taskId: string): UsageSum;
  /** What the harness actually ran: the newest row that names a model, null when none does. */
  latestModelForTask(taskId: string): string | null;
  /** Half-open window `[since, until)`; the caller owns day and week boundaries. */
  summarize(window: { since: string; until: string }): UsageBreakdown[];
};

const SUMS =
  "COALESCE(SUM(tokens), 0) AS tokens, SUM(tokens_input) AS tokens_input, SUM(tokens_output) AS tokens_output, SUM(tokens_cache_read) AS tokens_cache_read, SUM(tokens_cache_write) AS tokens_cache_write, SUM(cost_usd) AS cost_usd";

export function createUsageQueries(db: Database, events: EventQueries): UsageQueries {
  const sumTask = db.prepare(`SELECT ${SUMS} FROM usage WHERE task_id = ?`);
  const latestModel = db.prepare(
    `SELECT model FROM usage WHERE task_id = ? AND model IS NOT NULL
      ORDER BY ts DESC, id DESC LIMIT 1`,
  );
  // Attributed and unattributed rows never merge: only the first kind can be shown on a task.
  const summarizeRows = db.prepare(
    `SELECT harness, model, task_id IS NOT NULL AS attributed, ${SUMS}
       FROM usage WHERE ts >= ? AND ts < ?
      GROUP BY harness, model, attributed
      ORDER BY harness, model, attributed`,
  );

  return {
    record: recordUsage(db, events),
    sumForTask(taskId: string): UsageSum {
      return toSum(sumTask.get(taskId) as SumRow);
    },
    latestModelForTask(taskId: string): string | null {
      const row = latestModel.get(taskId) as { model: string } | undefined;
      return row?.model ?? null;
    },
    summarize(window: { since: string; until: string }): UsageBreakdown[] {
      const rows = summarizeRows.all(window.since, window.until) as BreakdownRow[];
      return rows.map((row) => ({
        ...toSum(row),
        harness: toHarness(row.harness),
        model: row.model,
        attributed: row.attributed === 1,
      }));
    },
  };
}

function recordUsage(db: Database, events: EventQueries): UsageQueries["record"] {
  const insertRow = db.prepare(
    `INSERT OR IGNORE INTO usage (ts, task_id, harness, model, tokens, tokens_input, tokens_output,
       tokens_cache_read, tokens_cache_write, cost_usd, source, ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return db.transaction((taskId: string | null, rows: UsageInput[]) => {
    const inserted = rows.filter(
      (row) =>
        insertRow.run(
          row.ts,
          taskId,
          row.harness,
          row.model,
          row.tokens,
          row.tokensInput,
          row.tokensOutput,
          row.tokensCacheRead,
          row.tokensCacheWrite,
          row.costUsd,
          row.source,
          row.ref,
        ).changes === 1,
    );
    const first = inserted[0];
    if (first === undefined) {
      return { inserted: 0, event: null };
    }
    const event = events.append({
      // The event marks when agn learned of the usage; the rows keep the harness's own timestamps.
      ts: new Date().toISOString(),
      ...(taskId === null ? {} : { taskId }),
      kind: "usage.recorded",
      payload: {
        tokens: inserted.reduce((total, row) => total + row.tokens, 0),
        costUsd: sum(inserted.map((row) => row.costUsd)),
        source: first.source,
      },
    });
    return { inserted: inserted.length, event };
  });
}

function toSum(row: SumRow): UsageSum {
  return {
    tokens: row.tokens,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    tokensCacheRead: row.tokens_cache_read,
    tokensCacheWrite: row.tokens_cache_write,
    costUsd: row.cost_usd,
  };
}

function toHarness(value: string): HarnessId {
  const parsed = HarnessIdSchema.safeParse(value);
  if (!parsed.success) {
    throw rowInvalid("usage", parsed.error);
  }
  return parsed.data;
}

// Null means nothing was priced, which is what a subscription run looks like.
function sum(values: (number | null)[]): number | null {
  const priced = values.filter((value): value is number => value !== null);
  return priced.length === 0 ? null : priced.reduce((total, value) => total + value, 0);
}
