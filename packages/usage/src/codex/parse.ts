import { basename } from "node:path";
import type { LimitWindow } from "@agnostic/core";
import { z } from "zod";
import { jsonlLines } from "../jsonl-lines.js";
import type {
  ObservedLimit,
  ParsedTranscript,
  TranscriptParser,
  TranscriptTurn,
} from "../transcript-parser.js";

const Tokens = z.number().int().nonnegative().catch(0);

/**
 * Codex reports cumulative totals for the thread and the last turn's share of them. The last
 * turn's figures are what a row is: on the first event the two are equal, and afterwards `last`
 * is exactly the difference, so nothing has to be carried between events.
 */
const TurnUsageSchema = z.object({
  input_tokens: Tokens.optional(),
  cached_input_tokens: Tokens.optional(),
  output_tokens: Tokens.optional(),
});

/**
 * The plan's own meter, which Codex piggybacks on the same `token_count` event. `window_minutes`
 * names the window, so a rename of `primary` does not move a figure onto the wrong one.
 */
const RateLimitWindowSchema = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number(),
});

const RolloutRecordSchema = z.object({
  timestamp: z.string().min(1),
  type: z.string().min(1),
  payload: z
    .object({
      type: z.string().min(1).optional(),
      id: z.string().min(1).optional(),
      cwd: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      info: z.object({ last_token_usage: TurnUsageSchema.optional() }).nullish(),
      rate_limits: z
        .object({
          primary: RateLimitWindowSchema.nullish(),
          secondary: RateLimitWindowSchema.nullish(),
        })
        .nullish(),
    })
    .optional(),
});

/** The window lengths Codex reports, in minutes; anything else is dropped rather than guessed. */
const FIVE_HOUR_MINUTES = 300;
const WEEK_MINUTES = 10_080;

type RolloutRecord = z.infer<typeof RolloutRecordSchema>;

/** A rollout file is named for the session it holds, which is the id the hooks and `resume` use. */
const SESSION_ID_IN_NAME = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const codexParser: TranscriptParser = {
  harness: "codex",
  // A `token_count` event carries the rollout's rate limits, in every session Codex writes.
  reportsLimits: true,
  isTranscript: (path) => path.endsWith(".jsonl"),
  parse: parseCodexRollout,
};

/**
 * A Codex rollout is one thread: a `session_meta` header, a `turn_context` per turn naming the
 * model, and a `token_count` event after each response. Threads that Codex Desktop wrote report
 * only a context-window total and no buckets; those turns carry no priceable tokens and are
 * skipped rather than counted as input.
 */
async function parseCodexRollout(path: string): Promise<ParsedTranscript> {
  const turns: TranscriptTurn[] = [];
  let skipped = 0;
  let sessionId = SESSION_ID_IN_NAME.exec(basename(path, ".jsonl"))?.[0] ?? null;
  let cwd: string | null = null;
  let model: string | null = null;
  let ordinal = 0;
  let limit: ObservedLimit | null = null;
  for await (const { text } of jsonlLines(path)) {
    const record = rolloutRecord(text);
    if (record === null) {
      continue;
    }
    if (record.type === "session_meta") {
      sessionId = record.payload?.id ?? sessionId;
      cwd = record.payload?.cwd ?? cwd;
      continue;
    }
    if (record.type === "turn_context") {
      model = record.payload?.model ?? model;
      cwd = record.payload?.cwd ?? cwd;
      continue;
    }
    if (record.payload?.type === "token_count") {
      // The last event that carried one wins: a thread's newest figure is the account's newest.
      limit = toLimit(record) ?? limit;
    }
    const used = record.payload?.info?.last_token_usage;
    if (record.payload?.type !== "token_count" || !used || sessionId === null) {
      continue;
    }
    // The ordinal counts the events that reported usage, so a rescan builds the same refs.
    ordinal += 1;
    const turn = toTurn(record, { sessionId, cwd, model, ordinal }, used);
    if (turn === null) {
      skipped += 1;
      continue;
    }
    turns.push(turn);
  }
  return { turns, skipped, limit };
}

/** A `token_count` event with neither window agn knows carries no limit, not an empty one. */
function toLimit(record: RolloutRecord): ObservedLimit | null {
  const limits = record.payload?.rate_limits;
  if (limits === null || limits === undefined) {
    return null;
  }
  const fiveHour = toWindow(limits.primary, FIVE_HOUR_MINUTES);
  const week = toWindow(limits.secondary, WEEK_MINUTES);
  if (fiveHour === null && week === null) {
    return null;
  }
  return {
    harness: "codex",
    fiveHour,
    week,
    observedAt: record.timestamp,
    source: "codex-rollout",
  };
}

function toWindow(
  raw: z.infer<typeof RateLimitWindowSchema> | null | undefined,
  minutes: number,
): LimitWindow | null {
  if (raw === null || raw === undefined || raw.window_minutes !== minutes) {
    return null;
  }
  return { usedPercent: raw.used_percent, resetsAt: new Date(raw.resets_at * 1_000).toISOString() };
}

function rolloutRecord(line: string): RolloutRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    // A half-written last line is what a live session looks like from here.
    return null;
  }
  const parsed = RolloutRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Cached input is part of the input Codex reports, so the two buckets are split here, not added. */
function toTurn(
  record: RolloutRecord,
  thread: { sessionId: string; cwd: string | null; model: string | null; ordinal: number },
  used: z.infer<typeof TurnUsageSchema>,
): TranscriptTurn | null {
  const cached = used.cached_input_tokens ?? 0;
  const tokensInput = Math.max(0, (used.input_tokens ?? 0) - cached);
  const tokensOutput = used.output_tokens ?? 0;
  if (tokensInput + tokensOutput + cached === 0) {
    return null;
  }
  return {
    harness: "codex",
    sessionId: thread.sessionId,
    cwd: thread.cwd,
    ts: record.timestamp,
    model: thread.model,
    tokensInput,
    tokensOutput,
    tokensCacheRead: cached,
    // Codex reports no cache-write bucket of its own, and zero would claim it reported one.
    tokensCacheWrite: null,
    ref: `codex:${thread.sessionId}:${thread.ordinal}`,
  };
}
