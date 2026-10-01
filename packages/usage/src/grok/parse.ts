// The record shape - `shell.turn.inference_done` events in `~/.grok/logs/unified.jsonl` carrying
// a per-turn `usage` - is the 2026-09-30 survey's reading of Grok CLI's log, not a port.
// Unverified live: no Grok CLI was installed on the machine this was written on.
import { basename } from "node:path";
import { z } from "zod";
import { jsonlLines } from "../jsonl-lines.js";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";

const Tokens = z.number().int().nonnegative().catch(0);

/** Grok reports the cached part inside `input_tokens`, as the OpenAI-shaped APIs do. */
const UsageSchema = z.object({
  input_tokens: Tokens.optional(),
  output_tokens: Tokens.optional(),
  cached_tokens: Tokens.optional(),
});

const RecordSchema = z.object({
  ts: z.string().min(1).optional(),
  event: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  usage: UsageSchema.nullish(),
});

/** The one event that reports what a turn spent; the rest of the log is tool and shell tracing. */
const INFERENCE_DONE = "shell.turn.inference_done";

export const grokParser: TranscriptParser = {
  harness: "grok",
  isTranscript: (path) => basename(path) === "unified.jsonl",
  parse: parseUnifiedLog,
};

/**
 * One log for every session on the machine, appended to as each turn finishes. The file is parsed
 * whole whenever it changes: the ledger's unique ref makes the turns agn already read insert
 * nothing, so there is no resume state to keep.
 */
async function parseUnifiedLog(path: string): Promise<ParsedTranscript> {
  const turns: TranscriptTurn[] = [];
  let skipped = 0;
  for await (const { n, text } of jsonlLines(path)) {
    const record = logRecord(text);
    if (record === null || record.event !== INFERENCE_DONE || !record.ts) {
      continue;
    }
    const turn = toTurn(record, n);
    if (turn === null) {
      skipped += record.usage == null ? 0 : 1;
      continue;
    }
    turns.push(turn);
  }
  return { turns, skipped, limit: null };
}

function logRecord(line: string): z.infer<typeof RecordSchema> | null {
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

/** Null when the event reported no tokens at all, which is not the same as zero tokens. */
function toTurn(record: z.infer<typeof RecordSchema>, line: number): TranscriptTurn | null {
  const cached = record.usage?.cached_tokens ?? 0;
  const tokensInput = Math.max(0, (record.usage?.input_tokens ?? 0) - cached);
  const tokensOutput = record.usage?.output_tokens ?? 0;
  if (tokensInput + tokensOutput + cached === 0) {
    return null;
  }
  const sessionId = record.sessionId ?? "";
  return {
    harness: "grok",
    sessionId,
    cwd: record.cwd ?? null,
    ts: record.ts ?? "",
    model: record.model ?? null,
    tokensInput,
    tokensOutput,
    tokensCacheRead: cached,
    // Grok reports no cache-write bucket, and zero would claim it reported one.
    tokensCacheWrite: null,
    costUsd: null,
    // The line number is stable across rescans of a file that is only appended to.
    ref: `grok:${sessionId}:${line}`,
  };
}
