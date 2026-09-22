// The bucket split - cached input capped at input, reasoning counted as output - and the
// seconds-or-milliseconds timestamps come from stablyai/orca
// `src/main/opencode-usage/opencode-usage-row-parsing.ts` (MIT © Lovecast Inc.).
import { basename } from "node:path";
import DatabaseConstructor from "better-sqlite3";
import { z } from "zod";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";
import { type MessageRow, messageRows, sessionTotals } from "./rows.js";

const Tokens = z.number().int().nonnegative().catch(0);

const MessageDataSchema = z.object({
  sessionID: z.string().min(1).optional(),
  modelID: z.string().min(1).optional(),
  providerID: z.string().min(1).optional(),
  path: z.object({ cwd: z.string().min(1).optional() }).nullish(),
  tokens: z
    .object({
      input: Tokens.optional(),
      output: Tokens.optional(),
      reasoning: Tokens.optional(),
      cache: z.object({ read: Tokens.optional(), write: Tokens.optional() }).nullish(),
    })
    .nullish(),
  time: z.object({ created: z.number().optional(), completed: z.number().optional() }).nullish(),
});

type MessageData = z.infer<typeof MessageDataSchema>;

/** A live OpenCode writes to `opencode.db`; a sibling `opencode-*.db` is a copy of older turns. */
export const opencodeParser: TranscriptParser = {
  harness: "opencode",
  isTranscript: (path) => basename(path) === "opencode.db",
  parse: parseOpenCodeDatabase,
};

/**
 * OpenCode keeps its transcripts in SQLite, one row per message with the usage as JSON. The
 * database is opened read-only, and a session that carries running totals instead of message rows
 * is counted as skipped: a total is cumulative, so turning it into a row would bill it twice.
 */
async function parseOpenCodeDatabase(path: string): Promise<ParsedTranscript> {
  const db = new DatabaseConstructor(path, { readonly: true, fileMustExist: true });
  try {
    // In addition to `readonly`: this connection cannot write, not even a journal page.
    db.pragma("query_only = ON");
    const rows = messageRows(db);
    if (rows.length === 0) {
      return { turns: [], skipped: sessionTotals(db) };
    }
    const turns: TranscriptTurn[] = [];
    let skipped = 0;
    for (const row of rows) {
      const turn = toTurn(row);
      if (turn === null) {
        skipped += 1;
        continue;
      }
      turns.push(turn);
    }
    return { turns, skipped };
  } finally {
    db.close();
  }
}

function toTurn(row: MessageRow): TranscriptTurn | null {
  const data = messageData(row.data);
  const ts = timestamp(data, row);
  if (data === null || ts === null) {
    return null;
  }
  const input = data.tokens?.input ?? 0;
  const output = data.tokens?.output ?? 0;
  const reasoning = data.tokens?.reasoning ?? 0;
  // OpenCode reports the cached part inside the input total, so the two are split, not added.
  const tokensCacheRead = Math.min(data.tokens?.cache?.read ?? 0, input);
  const tokensCacheWrite = data.tokens?.cache?.write ?? null;
  if (input + output + reasoning + (tokensCacheWrite ?? 0) === 0) {
    return null;
  }
  return {
    harness: "opencode",
    sessionId: data.sessionID ?? row.session_id,
    cwd: data.path?.cwd ?? row.directory,
    ts,
    model: modelLabel(data),
    tokensInput: input - tokensCacheRead,
    // A reasoning token is billed as output and OpenCode reports it beside, not inside, output.
    tokensOutput: output + reasoning,
    tokensCacheRead,
    tokensCacheWrite,
    ref: `opencode:${data.sessionID ?? row.session_id}:${row.id}`,
  };
}

function messageData(value: string): MessageData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  const parsed = MessageDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function modelLabel(data: MessageData): string | null {
  if (data.modelID === undefined) {
    return null;
  }
  return data.providerID === undefined ? data.modelID : `${data.providerID}/${data.modelID}`;
}

/** The message's own completion time, then its creation time, then the row's. */
function timestamp(data: MessageData | null, row: MessageRow): string | null {
  const millis =
    asMillis(data?.time?.completed) ?? asMillis(data?.time?.created) ?? asMillis(row.time_created);
  return millis === null ? null : new Date(millis).toISOString();
}

/** OpenCode has written both seconds and milliseconds; anything this small is seconds. */
function asMillis(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value < 10_000_000_000 ? value * 1_000 : value;
}
