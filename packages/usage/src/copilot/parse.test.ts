import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import DatabaseConstructor from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copilotParser } from "./parse.js";

/**
 * The database is built in a temp directory from the SQL beside the other transcript fixtures, so
 * nothing binary is committed. The table and column names are the 2026-09-30 survey's reading of
 * `~/.copilot/session-store.db` and are unverified live.
 */
const SQL = fileURLToPath(
  new URL("../../../../tests/fixtures/transcripts/copilot/", import.meta.url),
);

let temp = "";

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-copilot-db-"));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function database(rows: string | null): Promise<string> {
  const path = join(temp, "session-store.db");
  const db = new DatabaseConstructor(path);
  try {
    db.exec(await readFile(`${SQL}schema.sql`, "utf8"));
    if (rows !== null) {
      db.exec(await readFile(`${SQL}${rows}`, "utf8"));
    }
  } finally {
    db.close();
  }
  return path;
}

describe("the Copilot session-store parser", () => {
  it("reads the store itself and not the write-ahead log beside it", () => {
    expect(copilotParser.isTranscript("/home/u/.copilot/session-store.db")).toBe(true);
    expect(copilotParser.isTranscript("/home/u/.copilot/session-store.db-wal")).toBe(false);
  });

  it("joins each billed request to the directory of its session", async () => {
    const { turns, skipped, limit } = await copilotParser.parse(await database("rows.sql"));

    // The request Copilot did not bill for is no turn, and the session with no events yields none.
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({
      harness: "copilot",
      sessionId: "cop-s1",
      cwd: "/work/repo",
      ts: "2026-09-11T14:00:20.000Z",
      model: "gpt-5-codex",
      tokensInput: 1200,
      tokensOutput: 300,
      tokensCacheRead: 1000,
      tokensCacheWrite: 50,
      costUsd: null,
      ref: "copilot:ev1",
    });
    // Empty cache columns stay null: zero would claim Copilot reported a bucket it did not.
    expect(turns[1]).toMatchObject({ tokensCacheRead: null, tokensCacheWrite: null });
    expect(skipped).toBe(0);
    expect(limit).toBeNull();
  });

  it("builds the same refs on a second parse, so a rescan inserts nothing", async () => {
    const path = await database("rows.sql");
    const first = await copilotParser.parse(path);
    const second = await copilotParser.parse(path);

    expect(second.turns.map((turn) => turn.ref)).toEqual(first.turns.map((turn) => turn.ref));
  });

  it("reports nothing for a store that holds no usage events", async () => {
    const path = await database(null);

    expect((await copilotParser.parse(path)).turns).toEqual([]);
  });
});
