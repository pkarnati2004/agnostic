import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "../ledger.js";
import { migrate } from "../migrate.js";
import { initial } from "./001-initial.js";
import { taskBaseCommit } from "./002-task-base-commit.js";

const now = "2026-09-14T10:00:00.000Z";

/** A database written by a build that knew the first two migrations, with a five-column repo row. */
function version2Database(): string {
  const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
  const db = new Database(path);
  migrate(db, [initial, taskBaseCommit]);
  db.prepare("INSERT INTO repos (id, path, kind, name, added_at) VALUES (?, ?, ?, ?, ?)").run(
    "r3n9v2wxyz",
    "/tmp/petal",
    "git",
    "petal",
    now,
  );
  db.close();
  return path;
}

let ledger: Ledger;

afterEach(() => {
  ledger.close();
});

describe("migration 003", () => {
  it("reads a repo written before the column as active", () => {
    ledger = openLedger(version2Database());
    expect(ledger.repos.get("r3n9v2wxyz")).toMatchObject({ name: "petal", status: "active" });
  });

  it("closes the migrated repo and says so in one repo.updated event", () => {
    ledger = openLedger(version2Database());
    const latest = ledger.events.latestId();
    expect(ledger.repos.update("r3n9v2wxyz", { status: "archived" }).status).toBe("archived");
    expect(ledger.repos.get("r3n9v2wxyz")?.status).toBe("archived");

    const events = ledger.events.after(latest);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "repo.updated",
      payload: { repo: { status: "archived" } },
    });
  });

  it("inserts a fresh repo as active and filters the closed one out of the list", () => {
    ledger = openLedger(":memory:");
    ledger.repos.insert({
      id: "r7k2m4pqrs",
      path: "/tmp/petal",
      kind: "git",
      name: "petal",
      addedAt: now,
      status: "active",
    });
    expect(ledger.repos.list({ status: "active" })).toHaveLength(1);
    ledger.repos.update("r7k2m4pqrs", { status: "archived" });
    expect(ledger.repos.list({ status: "active" })).toEqual([]);
    expect(ledger.repos.list()).toHaveLength(1);
  });

  it("refuses a status the schema does not name", () => {
    const path = version2Database();
    ledger = openLedger(path);
    const db = new Database(path);
    expect(() =>
      db.prepare("UPDATE repos SET status = 'gone' WHERE id = ?").run("r3n9v2wxyz"),
    ).toThrowError(/CHECK constraint failed/);
    db.close();
  });
});
