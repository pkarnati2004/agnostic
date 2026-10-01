// Opening the store read-only with `query_only` is the rule the OpenCode parser already follows
// (`../opencode/parse.ts`); the table layout is the survey's, not a port.
import { basename } from "node:path";
import DatabaseConstructor from "better-sqlite3";
import type { ParsedTranscript, TranscriptParser, TranscriptTurn } from "../transcript-parser.js";
import { type UsageEventRow, usageEventRows } from "./rows.js";

/** `~/.copilot/session-store.db`; the write-ahead log beside it is part of the same database. */
export const copilotParser: TranscriptParser = {
  harness: "copilot",
  isTranscript: (path) => basename(path) === "session-store.db",
  parse: parseSessionStore,
};

/**
 * Copilot writes no transcript agn can read, but it keeps one row per billed request in SQLite.
 * The database is opened read-only, and a row with no tokens at all is no turn: Copilot meters
 * premium requests on its own server, and a zero row is a request it did not bill for.
 */
async function parseSessionStore(path: string): Promise<ParsedTranscript> {
  const db = new DatabaseConstructor(path, { readonly: true, fileMustExist: true });
  try {
    // In addition to `readonly`: this connection cannot write, not even a journal page.
    db.pragma("query_only = ON");
    const turns = usageEventRows(db).flatMap((row) => {
      const turn = toTurn(row);
      return turn === null ? [] : [turn];
    });
    return { turns, skipped: 0, limit: null };
  } finally {
    db.close();
  }
}

function toTurn(row: UsageEventRow): TranscriptTurn | null {
  const ts = timestamp(row.timestamp);
  const tokensInput = count(row.input_tokens);
  const tokensOutput = count(row.output_tokens);
  const tokensCacheRead = bucket(row.cache_read_tokens);
  const tokensCacheWrite = bucket(row.cache_write_tokens);
  if (ts === null || tokensInput + tokensOutput + (tokensCacheRead ?? 0) === 0) {
    return null;
  }
  return {
    harness: "copilot",
    sessionId: row.session_id ?? "",
    cwd: row.cwd,
    ts,
    model: row.model,
    // Copilot names its buckets as the Anthropic API does, where the cached read is its own
    // figure and not part of the input, so neither is subtracted here. Unverified live: what has
    // to be checked against a real store is whether `input_tokens` already contains
    // `cache_read_tokens`, which would double-count the cached part.
    tokensInput,
    tokensOutput,
    tokensCacheRead,
    tokensCacheWrite,
    costUsd: null,
    ref: `copilot:${row.id}`,
  };
}

function count(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** Null where the column is empty: zero in a bucket Copilot did not report would claim one. */
function bucket(value: number | null): number | null {
  return value === null ? null : count(value);
}

/** Copilot has written both an ISO string and epoch milliseconds; both become one ISO stamp. */
function timestamp(value: string | number | null): string | null {
  if (typeof value === "number") {
    const millis = value < 10_000_000_000 ? value * 1_000 : value;
    return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : null;
  }
  const parsed = value === null ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
