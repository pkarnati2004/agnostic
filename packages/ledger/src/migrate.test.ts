import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { LedgerError } from "./error.js";
import { type Migration, migrate } from "./migrate.js";

const first: Migration = { version: 1, name: "first", sql: "CREATE TABLE a (id TEXT)" };
const second: Migration = { version: 2, name: "second", sql: "CREATE TABLE b (id TEXT)" };

function appliedVersions(db: Database.Database): number[] {
  return (
    db.prepare("SELECT version FROM schema_version ORDER BY version").all() as {
      version: number;
    }[]
  ).map((row) => row.version);
}

describe("migrate", () => {
  it("applies a list in order and skips what is already recorded", () => {
    const db = new Database(":memory:");
    expect(migrate(db, [first, second])).toEqual([1, 2]);
    expect(appliedVersions(db)).toEqual([1, 2]);
    expect(migrate(db, [first, second])).toEqual([]);
  });

  it("rejects a list with a gap", () => {
    const db = new Database(":memory:");
    const broken = { ...second, version: 3 };
    expect(() => migrate(db, [first, broken])).toThrowError(
      expect.objectContaining({ code: "ledger-migration-failed" }),
    );
    expect(appliedVersions(db)).toEqual([]);
  });

  it("refuses a database newer than the build, pointing at an upgrade", () => {
    const db = new Database(":memory:");
    migrate(db, [first]);
    db.prepare("INSERT INTO schema_version VALUES (?, ?, ?)").run(
      99,
      "future",
      "2026-09-10T00:00:00.000Z",
    );
    let thrown: LedgerError | undefined;
    try {
      migrate(db, [first]);
    } catch (error) {
      thrown = error as LedgerError;
    }
    expect(thrown?.code).toBe("ledger-migration-failed");
    expect(thrown?.hint).toContain("Upgrade agn");
  });

  it("leaves schema_version untouched when a migration's SQL fails", () => {
    const db = new Database(":memory:");
    const bad: Migration = { version: 2, name: "bad", sql: "CREATE TABLE (" };
    expect(() => migrate(db, [first, bad])).toThrowError(
      expect.objectContaining({ code: "ledger-migration-failed" }),
    );
    expect(appliedVersions(db)).toEqual([1]);
  });
});
