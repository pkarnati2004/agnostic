import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import DatabaseConstructor, { type Database } from "better-sqlite3";
import { LedgerError } from "./error.js";
import { createEventQueries, type EventQueries } from "./event-queries.js";
import { migrate } from "./migrate.js";
import { createOutcomeQueries, type OutcomeQueries } from "./outcome-queries.js";
import { createRepoQueries, type RepoQueries } from "./repo-queries.js";
import { createTaskQueries, type TaskQueries } from "./task-queries.js";
import { createUsageQueries, type UsageQueries } from "./usage-queries.js";

const MEMORY = ":memory:";

export type Ledger = {
  readonly path: string;
  repos: RepoQueries;
  tasks: TaskQueries;
  events: EventQueries;
  usage: UsageQueries;
  outcomes: OutcomeQueries;
  /** Nested calls become savepoints, so a query keeps its own atomicity inside a wider one. */
  transaction<T>(fn: () => T): T;
  close(): void;
};

export function openLedger(path: string = agnosticPaths().db): Ledger {
  const db = open(path);
  migrate(db);
  const events = createEventQueries(db);
  return {
    path,
    repos: createRepoQueries(db, events),
    tasks: createTaskQueries(db, events),
    events,
    usage: createUsageQueries(db, events),
    outcomes: createOutcomeQueries(db, events),
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
    close(): void {
      db.close();
    },
  };
}

function open(path: string): Database {
  try {
    if (path !== MEMORY) {
      mkdirSync(dirname(path), { recursive: true });
    }
    const db = new DatabaseConstructor(path);
    // WAL so the CLI can read while the daemon writes; the timeout covers that overlap.
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    return db;
  } catch (cause) {
    throw new LedgerError(`cannot open the ledger at ${path}`, {
      code: "ledger-open-failed",
      hint: "Check that ~/.agnostic is writable and no other agn version is running.",
      cause,
    });
  }
}
