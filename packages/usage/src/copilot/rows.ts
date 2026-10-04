// The table and column names are the 2026-09-30 survey's reading of `~/.copilot/session-store.db`
// (`assistant_usage_events` joined to `sessions`), not a port. Unverified live: a column Copilot
// spells differently makes the query throw, which the scan reports as one unreadable transcript.
import type { Database } from "better-sqlite3";

/** One request Copilot billed, with the directory of the session it belonged to. */
export type UsageEventRow = {
  id: string;
  session_id: string | null;
  timestamp: string | number | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cwd: string | null;
};

/**
 * Every usage event the store holds, oldest first. The join is left: a session row Copilot has
 * already pruned leaves the event without a directory, which costs the row its attribution by
 * path and nothing else.
 */
export function usageEventRows(db: Database): UsageEventRow[] {
  if (!tableExists(db, "assistant_usage_events")) {
    return [];
  }
  return db
    .prepare(
      `SELECT e.id, e.session_id, e.timestamp, e.model, e.input_tokens, e.output_tokens,
              e.cache_read_tokens, e.cache_write_tokens, s.cwd
       FROM assistant_usage_events e
       LEFT JOIN sessions s ON s.id = e.session_id
       ORDER BY e.timestamp, e.id`,
    )
    .all() as UsageEventRow[];
}

function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return row !== undefined;
}
