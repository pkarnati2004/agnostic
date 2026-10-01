// The record shape - `usage_checkpointed` events in `~/.fx/sessions/<id>/events.jsonl` carrying
// the session's running totals and cost - is the 2026-09-30 survey's reading of fx's session log,
// not a port. Unverified live: no fx was installed on the machine this was written on.
import { basename, dirname } from "node:path";
import { z } from "zod";
import { jsonlLines } from "../jsonl-lines.js";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";

const Tokens = z.number().int().nonnegative().catch(0);

const UsageSchema = z.object({
  input: Tokens.optional(),
  output: Tokens.optional(),
  cache_read: Tokens.optional(),
  cache_write: Tokens.optional(),
});

const RecordSchema = z.object({
  ts: z.string().min(1).optional(),
  type: z.string().min(1),
  model: z.string().min(1).optional(),
  usage: UsageSchema.nullish(),
  cost: z.number().nonnegative().nullish(),
});

type Checkpoint = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Null on a checkpoint fx wrote no cost on, which is not the same as a run that cost nothing. */
  cost: number | null;
};

const START: Checkpoint = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };

const CHECKPOINT = "usage_checkpointed";

/** `~/.fx/sessions/<id>/events.jsonl`; the path also carries the session the rows belong to. */
export const fxParser: TranscriptParser = {
  harness: "fx",
  isTranscript: (path) => basename(path) === "events.jsonl",
  parse: parseSessionEvents,
};

/**
 * fx checkpoints the session's running totals rather than each turn, so a turn is one checkpoint
 * minus the one before it, bucket by bucket and cost alike. The first checkpoint is taken whole,
 * and so is one whose totals have dropped: fx started a new run in the same file. The arithmetic
 * is over the whole file, so a rescan derives the same rows and the refs dedupe them away.
 */
async function parseSessionEvents(path: string): Promise<ParsedTranscript> {
  const sessionId = basename(dirname(path));
  const turns: TranscriptTurn[] = [];
  let previous = START;
  for await (const { n, text } of jsonlLines(path)) {
    const record = eventRecord(text);
    if (record === null || record.type !== CHECKPOINT || !record.ts || record.usage == null) {
      continue;
    }
    const current = checkpoint(record);
    // A bucket below the previous total is a new run, not a negative turn.
    const base = restarted(previous, current) ? START : previous;
    // A checkpoint that omits the cost has not spent nothing: the last total fx wrote still stands.
    previous = { ...current, cost: current.cost ?? base.cost };
    const turn = toTurn(sessionId, record, difference(base, current), n);
    if (turn !== null) {
      turns.push(turn);
    }
  }
  return { turns, skipped: 0, limit: null };
}

function checkpoint(record: z.infer<typeof RecordSchema>): Checkpoint {
  return {
    input: record.usage?.input ?? 0,
    output: record.usage?.output ?? 0,
    cacheRead: record.usage?.cache_read ?? 0,
    cacheWrite: record.usage?.cache_write ?? 0,
    cost: record.cost ?? null,
  };
}

/**
 * Only the token buckets say so. A cost fx did not write on this checkpoint is unknown, not zero,
 * and a real restart drops every bucket anyway.
 */
function restarted(previous: Checkpoint, current: Checkpoint): boolean {
  return (
    current.input < previous.input ||
    current.output < previous.output ||
    current.cacheRead < previous.cacheRead ||
    current.cacheWrite < previous.cacheWrite
  );
}

function difference(base: Checkpoint, current: Checkpoint): Checkpoint {
  return {
    input: current.input - base.input,
    output: current.output - base.output,
    cacheRead: current.cacheRead - base.cacheRead,
    cacheWrite: current.cacheWrite - base.cacheWrite,
    cost: current.cost === null ? null : round(current.cost - (base.cost ?? 0)),
  };
}

/** Null for a checkpoint that reported the same totals as the one before it: no turn happened. */
function toTurn(
  sessionId: string,
  record: z.infer<typeof RecordSchema>,
  spent: Checkpoint,
  line: number,
): TranscriptTurn | null {
  if (spent.input + spent.output + spent.cacheRead + spent.cacheWrite === 0) {
    return null;
  }
  const reported = record.usage ?? {};
  return {
    harness: "fx",
    sessionId,
    cwd: null,
    ts: record.ts ?? "",
    model: record.model ?? null,
    tokensInput: spent.input,
    tokensOutput: spent.output,
    // Zero in a bucket fx never reported would claim it reported one.
    tokensCacheRead: reported.cache_read === undefined ? null : spent.cacheRead,
    tokensCacheWrite: reported.cache_write === undefined ? null : spent.cacheWrite,
    costUsd: record.cost == null ? null : spent.cost,
    ref: `fx:${sessionId}:${line}`,
  };
}

function eventRecord(line: string): z.infer<typeof RecordSchema> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    // A half-written last line is what a live session looks like from here.
    return null;
  }
  const parsed = RecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A cost is a difference of two floats; without this a turn reads as $0.30000000000000004. */
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
