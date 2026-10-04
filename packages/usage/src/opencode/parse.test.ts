import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import DatabaseConstructor from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { opencodeParser } from "./parse.js";

/**
 * The database is built in a temp directory from the SQL beside the other transcript fixtures, so
 * nothing binary is committed. The table layouts and the bucket split are Orca's
 * `src/main/opencode-usage/opencode-usage-row-queries.ts` and `-row-parsing.ts`.
 */
const SQL = fileURLToPath(
  new URL("../../../../tests/fixtures/transcripts/opencode/", import.meta.url),
);

let temp = "";

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-opencode-db-"));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function database(rows: string, name = "opencode.db"): Promise<string> {
  const path = join(temp, name);
  const db = new DatabaseConstructor(path);
  try {
    db.exec(await readFile(`${SQL}schema.sql`, "utf8"));
    db.exec(await readFile(`${SQL}${rows}`, "utf8"));
  } finally {
    db.close();
  }
  return path;
}

describe("the OpenCode transcript parser", () => {
  it("reads the live database and skips the copies beside it", () => {
    expect(opencodeParser.isTranscript("/home/u/.local/share/opencode/opencode.db")).toBe(true);
    expect(opencodeParser.isTranscript("/home/u/.local/share/opencode/opencode-backup.db")).toBe(
      false,
    );
  });

  it("splits the cached part out of the input and counts reasoning as output", async () => {
    const { turns, skipped } = await opencodeParser.parse(await database("rows.sql"));
    // The user message is not a turn; the assistant message with no buckets is skipped.
    expect(skipped).toBe(1);
    expect(turns[0]).toEqual({
      harness: "opencode",
      sessionId: "ses_root",
      cwd: "/work/repo",
      ts: "2026-08-29T10:40:02.000Z",
      model: "anthropic/claude-fable-5-1",
      tokensInput: 200,
      tokensOutput: 400,
      tokensCacheRead: 1000,
      tokensCacheWrite: 50,
      costUsd: null,
      ref: "opencode:ses_root:msg_1",
    });
  });

  it("reads a time in seconds and the message's own directory", async () => {
    const { turns } = await opencodeParser.parse(await database("rows.sql"));
    expect(turns[1]).toMatchObject({
      cwd: "/work/other",
      ts: "2026-08-29T10:40:04.000Z",
      model: "openai/gpt-5-4",
      tokensInput: 80,
      tokensOutput: 20,
    });
  });

  it("takes the cost OpenCode wrote, and null for a message it wrote none for", async () => {
    const { turns } = await opencodeParser.parse(await database("rows-cost.sql"));

    expect(turns.map((turn) => turn.costUsd)).toEqual([0.42, null]);
  });

  it("reads the older table when that is the one the database has", async () => {
    const { turns } = await opencodeParser.parse(await database("rows-session-message.sql"));
    expect(turns).toEqual([
      {
        harness: "opencode",
        sessionId: "ses_old",
        cwd: "/work/old",
        ts: "2026-08-29T10:40:02.000Z",
        model: "anthropic/claude-fable-5-1",
        tokensInput: 100,
        tokensOutput: 100,
        tokensCacheRead: 400,
        tokensCacheWrite: null,
        costUsd: null,
        ref: "opencode:ses_old:msg_old",
      },
    ]);
  });

  it("counts a session that keeps running totals instead of rows, and bills none of it", async () => {
    const { turns, skipped } = await opencodeParser.parse(await database("rows-totals-only.sql"));
    expect(turns).toEqual([]);
    expect(skipped).toBe(1);
  });

  it("reads a database that keeps neither message table, and bills nothing from it", async () => {
    const { turns, skipped } = await opencodeParser.parse(await database("rows-no-messages.sql"));
    expect(turns).toEqual([]);
    // Nothing was found and nothing was passed over: there is no usage in this database at all.
    expect(skipped).toBe(0);
  });

  it("refuses to open a database that is not there", async () => {
    await expect(opencodeParser.parse(join(temp, "missing.db"))).rejects.toThrow();
  });
});
