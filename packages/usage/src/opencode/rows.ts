// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import type { Database } from "better-sqlite3";

/** One assistant message as OpenCode stores it: its usage is the JSON in `data`. */
export type MessageRow = {
  id: string;
  session_id: string;
  time_created: number | null;
  data: string;
  directory: string | null;
};

/**
 * The per-message rows this database holds. `message` is the current table and `session_message`
 * the older one; a database with neither keeps session totals only, which are cumulative and
 * cannot become rows.
 */
export function messageRows(db: Database): MessageRow[] {
  if (!tableExists(db, "session")) {
    return [];
  }
  if (tableExists(db, "message")) {
    return selectRows(db, "message", "json_extract(m.data, '$.role') = 'assistant'");
  }
  if (tableExists(db, "session_message")) {
    return selectRows(db, "session_message", "json_extract(m.data, '$.tokens.input') IS NOT NULL");
  }
  return [];
}

/**
 * How many sessions carry totals no row can be built from. A total is the running sum for the
 * whole session, so counting it as a turn would bill every earlier turn again.
 */
export function sessionTotals(db: Database): number {
  const columns = ["tokens_input", "tokens_output", "tokens_reasoning", "tokens_cache_read"];
  if (!tableExists(db, "session") || !columns.every((name) => columnExists(db, "session", name))) {
    return 0;
  }
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM session WHERE ${columns.join(" + ")} > 0`)
    .get() as { count?: number } | undefined;
  return row?.count ?? 0;
}

function selectRows(db: Database, table: string, predicate: string): MessageRow[] {
  return db
    .prepare(
      `SELECT m.id, m.session_id, m.time_created, m.data, s.directory
       FROM ${table} m
       JOIN session s ON s.id = m.session_id
       WHERE ${predicate}
       ORDER BY m.time_created, m.id`,
    )
    .all() as MessageRow[];
}

function tableExists(db: Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return row !== undefined;
}

function columnExists(db: Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((info) => info.name === column);
}
