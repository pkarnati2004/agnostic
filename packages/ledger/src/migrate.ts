import type { Database } from "better-sqlite3";
import { LedgerError } from "./error.js";
import { initial } from "./migrations/001-initial.js";
import { taskBaseCommit } from "./migrations/002-task-base-commit.js";
import { repoStatus } from "./migrations/003-repo-status.js";
import { repoStatusRemoved } from "./migrations/004-repo-status-removed.js";
import { harnessIds } from "./migrations/005-harness-ids.js";
import { taskCompareId } from "./migrations/006-task-compare-id.js";

export type Migration = { version: number; name: string; sql: string };

const migrations: readonly Migration[] = [
  initial,
  taskBaseCommit,
  repoStatus,
  repoStatusRemoved,
  harnessIds,
  taskCompareId,
];

// migrate owns this table: it has to read the applied versions before any migration can run.
const SCHEMA_VERSION = `CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

/** Applies every migration the database has not seen and returns the versions applied this run. */
export function migrate(db: Database, list: readonly Migration[] = migrations): number[] {
  db.exec(SCHEMA_VERSION);
  checkContiguous(list);
  const recorded = new Set(
    (db.prepare("SELECT version FROM schema_version").all() as { version: number }[]).map(
      (row) => row.version,
    ),
  );
  checkNotAhead(recorded, list);

  const applied: number[] = [];
  // A migration that rebuilds a table drops it while another table still points at it, and
  // `PRAGMA foreign_keys` is a no-op inside a transaction, so the switch sits around the run.
  db.pragma("foreign_keys = OFF");
  try {
    for (const migration of list) {
      if (recorded.has(migration.version)) {
        continue;
      }
      apply(db, migration);
      applied.push(migration.version);
    }
  } finally {
    db.pragma("foreign_keys = ON");
  }
  return applied;
}

function apply(db: Database, migration: Migration): void {
  const record = db.prepare(
    "INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)",
  );
  try {
    db.transaction(() => {
      db.exec(migration.sql);
      checkForeignKeys(db);
      record.run(migration.version, migration.name, new Date().toISOString());
    })();
  } catch (cause) {
    throw new LedgerError(`migration ${migration.version} (${migration.name}) failed`, {
      code: "ledger-migration-failed",
      hint: "The database is unchanged. Report this with the error below.",
      cause,
    });
  }
}

// Foreign keys are off while a migration runs, so the rows are checked before the commit instead.
function checkForeignKeys(db: Database): void {
  const broken = db.pragma("foreign_key_check") as { table?: string }[];
  if (broken.length > 0) {
    throw new Error(`${broken.length} row(s) in ${broken[0]?.table} point at a row that is gone`);
  }
}

function checkContiguous(list: readonly Migration[]): void {
  const gap = list.findIndex((migration, index) => migration.version !== index + 1);
  if (gap !== -1) {
    throw new LedgerError(
      `migration list jumps to version ${list[gap]?.version} at position ${gap + 1}`,
      {
        code: "ledger-migration-failed",
        hint: "Migrations are numbered from 1 with no gaps.",
      },
    );
  }
}

function checkNotAhead(recorded: ReadonlySet<number>, list: readonly Migration[]): void {
  const highest = Math.max(0, ...recorded);
  if (highest > list.length) {
    throw new LedgerError(
      `the database is at schema version ${highest}, newer than this build understands (${list.length})`,
      {
        code: "ledger-migration-failed",
        hint: "Upgrade agn to a version that knows this schema.",
      },
    );
  }
}
