import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { grokParser } from "./parse.js";

const LOG = fileURLToPath(
  new URL("../../../../tests/fixtures/transcripts/grok/logs/unified.jsonl", import.meta.url),
);

describe("the Grok unified log parser", () => {
  it("reads the one log Grok keeps and nothing else in the directory", () => {
    expect(grokParser.isTranscript("/home/u/.grok/logs/unified.jsonl")).toBe(true);
    expect(grokParser.isTranscript("/home/u/.grok/logs/chat_history.jsonl")).toBe(false);
  });

  it("counts the inference events and splits the cached part out of the input", async () => {
    const { turns, skipped, limit } = await grokParser.parse(LOG);

    // The session-start and tool events are not turns, and the half-written last line is dropped.
    expect(turns).toHaveLength(2);
    expect(turns[0]).toEqual({
      harness: "grok",
      sessionId: "grok-s1",
      cwd: "/work/repo",
      ts: "2026-09-11T14:00:20.000Z",
      model: "grok-5",
      tokensInput: 1000,
      tokensOutput: 300,
      tokensCacheRead: 200,
      tokensCacheWrite: null,
      costUsd: null,
      // One file holds every session, so the line number is what makes a row unique.
      ref: "grok:grok-s1:2",
    });
    expect(turns[1]).toMatchObject({ sessionId: "grok-s2", ref: "grok:grok-s2:4" });
    expect(skipped).toBe(0);
    expect(limit).toBeNull();
  });

  it("derives the same rows when the file is parsed again", async () => {
    const first = await grokParser.parse(LOG);
    const second = await grokParser.parse(LOG);

    expect(second.turns).toEqual(first.turns);
  });
});
