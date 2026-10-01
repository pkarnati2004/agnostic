// The record shape, the prefilter, the dedupe key and the max-per-bucket merge come from
// stablyai/orca `src/main/claude-usage/transcript-record-parser.ts` (MIT © Lovecast Inc.).
import { basename } from "node:path";
import { z } from "zod";
import { jsonlLines } from "../jsonl-lines.js";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";

const Tokens = z.number().int().nonnegative().catch(0);

/**
 * `cache_creation` splits the write bucket by TTL. agn stores four buckets (ADR 007), so the 1h
 * part is read only to be ignored: it is already included in `cache_creation_input_tokens`.
 */
const UsageSchema = z.object({
  input_tokens: Tokens.optional(),
  output_tokens: Tokens.optional(),
  cache_read_input_tokens: Tokens.optional(),
  cache_creation_input_tokens: Tokens.optional(),
});

const AssistantRecordSchema = z.object({
  type: z.literal("assistant"),
  sessionId: z.string().min(1).optional(),
  timestamp: z.string().min(1),
  cwd: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  uuid: z.string().min(1).optional(),
  message: z
    .object({
      id: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      usage: UsageSchema.optional(),
    })
    .optional(),
});

type AssistantRecord = z.infer<typeof AssistantRecordSchema>;

export const claudeCodeParser: TranscriptParser = {
  harness: "claude-code",
  // Claude Code reports its limits to the status line, not into the transcript.
  reportsLimits: false,
  isTranscript: (path) => path.endsWith(".jsonl"),
  parse: parseClaudeCodeTranscript,
};

/**
 * Claude Code writes one JSON record per line and streams an assistant message over several of
 * them, each carrying the same usage under the same message and request ids. Sub-agent
 * transcripts live in their own files under the session directory and report the parent's
 * `sessionId`, so they are attributed to the task that started the session.
 */
async function parseClaudeCodeTranscript(path: string): Promise<ParsedTranscript> {
  // A resumed session is written to a file named for the new session id; older records inside it
  // still carry their own, and a record without one belongs to the file it is in.
  const fallbackSessionId = basename(path, ".jsonl");
  const turns: TranscriptTurn[] = [];
  const seen = new Map<string, number>();
  for await (const { n, text } of jsonlLines(path)) {
    const record = assistantRecord(text);
    if (record === null) {
      continue;
    }
    const turn = toTurn(record, fallbackSessionId, `file:${basename(path)}:${n}`);
    if (turn === null) {
      continue;
    }
    const at = seen.get(turn.ref);
    const existing = at === undefined ? undefined : turns[at];
    if (at !== undefined && existing !== undefined) {
      // A later copy of a streamed message can carry the fuller usage, never a smaller one.
      turns[at] = merge(existing, turn);
      continue;
    }
    seen.set(turn.ref, turns.length);
    turns.push(turn);
  }
  // Claude Code reports every bucket on every turn; the records dropped above carry no usage.
  return { turns, skipped: 0, limit: null };
}

/**
 * Only assistant records carry usage, and the lines between them embed whole files and command
 * output. `JSON.stringify` never escapes ASCII letters, so a record of type `assistant` always
 * spells the word; the check over-admits, and the parsed `type` stays the authority.
 */
function assistantRecord(line: string): AssistantRecord | null {
  if (!line.includes("assistant")) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    // A half-written last line is what a live session looks like from here.
    return null;
  }
  const parsed = AssistantRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Null when the record carries no tokens at all: a refusal or a synthetic message. */
function toTurn(
  record: AssistantRecord,
  fallbackSessionId: string,
  fallbackKey: string,
): TranscriptTurn | null {
  const usage = record.message?.usage;
  const tokensInput = usage?.input_tokens ?? 0;
  const tokensOutput = usage?.output_tokens ?? 0;
  const tokensCacheRead = usage?.cache_read_input_tokens ?? 0;
  const tokensCacheWrite = usage?.cache_creation_input_tokens ?? 0;
  if (tokensInput + tokensOutput + tokensCacheRead + tokensCacheWrite === 0) {
    return null;
  }
  return {
    harness: "claude-code",
    sessionId: record.sessionId ?? fallbackSessionId,
    cwd: record.cwd ?? null,
    ts: record.timestamp,
    model: record.message?.model ?? null,
    tokensInput,
    tokensOutput,
    tokensCacheRead,
    tokensCacheWrite,
    ref: `claude-code:${dedupeKey(record) ?? fallbackKey}`,
  };
}

/**
 * A fork or a resume copies earlier turns into a new file under a new session id, keeping the
 * message and request ids. The strongest identity available is the one that survives the copy.
 */
function dedupeKey(record: AssistantRecord): string | null {
  const messageId = record.message?.id;
  if (messageId !== undefined && record.requestId !== undefined) {
    return `${messageId}:${record.requestId}`;
  }
  if (messageId !== undefined) {
    return `msg:${messageId}`;
  }
  return record.uuid === undefined ? null : `uuid:${record.uuid}`;
}

function merge(existing: TranscriptTurn, next: TranscriptTurn): TranscriptTurn {
  return {
    ...existing,
    tokensInput: Math.max(existing.tokensInput, next.tokensInput),
    tokensOutput: Math.max(existing.tokensOutput, next.tokensOutput),
    tokensCacheRead: Math.max(existing.tokensCacheRead ?? 0, next.tokensCacheRead ?? 0),
    tokensCacheWrite: Math.max(existing.tokensCacheWrite ?? 0, next.tokensCacheWrite ?? 0),
  };
}
