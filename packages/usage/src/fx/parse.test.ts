import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fxParser } from "./parse.js";

const EVENTS = fileURLToPath(
  new URL(
    "../../../../tests/fixtures/transcripts/fx/sessions/ses-7f12/events.jsonl",
    import.meta.url,
  ),
);

let temp = "";

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "agn-fx-"));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

/** A session log of this test's own, for a checkpoint sequence the fixture tree does not hold. */
async function eventsFile(records: unknown[]): Promise<string> {
  const path = join(temp, "events.jsonl");
  await writeFile(path, records.map((record) => `${JSON.stringify(record)}\n`).join(""), "utf8");
  return path;
}

function checkpointRecord(
  ts: string,
  usage: Record<string, number>,
  cost?: number,
): Record<string, unknown> {
  return {
    ts,
    type: "usage_checkpointed",
    model: "fx-sonnet",
    usage,
    ...(cost === undefined ? {} : { cost }),
  };
}

describe("the fx session-events parser", () => {
  it("reads a session's event log", () => {
    expect(fxParser.isTranscript("/home/u/.fx/sessions/ses-7f12/events.jsonl")).toBe(true);
    expect(fxParser.isTranscript("/home/u/.fx/sessions/ses-7f12/messages.jsonl")).toBe(false);
  });

  it("takes the first checkpoint whole and every later one as its difference", async () => {
    const { turns, skipped } = await fxParser.parse(EVENTS);

    expect(turns).toHaveLength(4);
    expect(turns[0]).toEqual({
      harness: "fx",
      sessionId: "ses-7f12",
      cwd: null,
      ts: "2026-09-11T14:00:20.000Z",
      model: "fx-sonnet",
      tokensInput: 1000,
      tokensOutput: 200,
      tokensCacheRead: 500,
      tokensCacheWrite: 40,
      costUsd: 0.12,
      ref: "fx:ses-7f12:2",
    });
    expect(turns[1]).toMatchObject({
      tokensInput: 600,
      tokensOutput: 60,
      tokensCacheRead: 400,
      tokensCacheWrite: 0,
      costUsd: 0.18,
    });
    expect(turns[2]).toMatchObject({ tokensInput: 400, tokensOutput: 40, costUsd: 0.25 });
    expect(skipped).toBe(0);
  });

  it("takes a checkpoint whose totals have dropped whole: fx started a new run", async () => {
    const { turns } = await fxParser.parse(EVENTS);

    expect(turns[3]).toMatchObject({
      ts: "2026-09-11T14:03:20.000Z",
      tokensInput: 120,
      tokensOutput: 30,
      tokensCacheRead: 0,
      costUsd: 0.02,
    });
  });

  it("derives the same rows when the file is parsed again, so a rescan inserts nothing", async () => {
    const first = await fxParser.parse(EVENTS);
    const second = await fxParser.parse(EVENTS);

    expect(second.turns).toEqual(first.turns);
  });

  it("keeps counting tokens when a later checkpoint writes no cost", async () => {
    const path = await eventsFile([
      checkpointRecord("2026-09-11T14:00:20.000Z", { input: 1_000, output: 200 }, 0.12),
      checkpointRecord("2026-09-11T14:01:20.000Z", { input: 1_600, output: 260 }),
    ]);

    const { turns } = await fxParser.parse(path);

    // The missing cost is unknown, not a drop to zero: the second turn is still a difference.
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ tokensInput: 600, tokensOutput: 60, costUsd: null });
  });

  it("prices the next cost against the last one fx wrote, not against the gap", async () => {
    const path = await eventsFile([
      checkpointRecord("2026-09-11T14:00:20.000Z", { input: 1_000, output: 200 }, 0.12),
      checkpointRecord("2026-09-11T14:01:20.000Z", { input: 1_600, output: 260 }),
      checkpointRecord("2026-09-11T14:02:20.000Z", { input: 2_000, output: 300 }, 0.3),
    ]);

    const { turns } = await fxParser.parse(path);

    expect(turns[2]).toMatchObject({ tokensInput: 400, costUsd: 0.18 });
  });

  it("gives a repeated checkpoint no turn of its own", async () => {
    const record = checkpointRecord(
      "2026-09-11T14:00:20.000Z",
      { input: 1_000, output: 200 },
      0.12,
    );
    const path = await eventsFile([record, record]);

    const { turns } = await fxParser.parse(path);

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ tokensInput: 1_000, costUsd: 0.12 });
  });
});
