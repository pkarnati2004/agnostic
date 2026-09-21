import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TranscriptTurn } from "../transcript-parser.js";
import { piFamilyParser } from "./parse.js";

/**
 * `transcripts/pi/2026-09-01T10-00-00_abc.jsonl` is written to the message-graph shape Orca reads
 * in `src/main/ai-vault/session-scanner-graph-parsers.ts`; `transcripts/omp/omp-session.jsonl` is
 * the records of its `writeOmpScannerFixture`, whose total is deliberately not the sum of the
 * buckets.
 */
const TRANSCRIPTS = fileURLToPath(
  new URL("../../../../tests/fixtures/transcripts/", import.meta.url),
);

const PI_FILE = `${TRANSCRIPTS}pi/2026-09-01T10-00-00_abc.jsonl`;
const OMP_FILE = `${TRANSCRIPTS}omp/omp-session.jsonl`;

/** What each row is worth, the way a window sums it: every bucket the message reported. */
function priced(turn: TranscriptTurn): { ref: string; model: string | null; tokens: number } {
  return {
    ref: turn.ref,
    model: turn.model,
    tokens:
      turn.tokensInput +
      turn.tokensOutput +
      (turn.tokensCacheRead ?? 0) +
      (turn.tokensCacheWrite ?? 0),
  };
}

describe("the Pi transcript parser", () => {
  it("reads one row per assistant message that reported a bucket", async () => {
    const { turns, skipped } = await piFamilyParser("pi").parse(PI_FILE);
    expect(turns).toHaveLength(3);
    // The third assistant message reported a total and no buckets, so there is nothing to price.
    expect(skipped).toBe(1);
    expect(turns[0]).toEqual({
      harness: "pi",
      sessionId: PI_FILE,
      cwd: "/work/repo",
      ts: "2026-09-01T10:00:03.000Z",
      model: "anthropic/claude-fable-5-1",
      tokensInput: 120,
      tokensOutput: 40,
      tokensCacheRead: 60,
      tokensCacheWrite: 10,
      ref: "pi:pi-abc:msg_1",
    });
  });

  it("prefers the model the message names over the last one the session switched to", async () => {
    const { turns } = await piFamilyParser("pi").parse(PI_FILE);
    expect(turns[1]?.model).toBe("anthropic/claude-fable-5-1");
    expect(turns[1]?.tokensCacheRead).toBeNull();
    expect(turns[1]?.tokensCacheWrite).toBeNull();
  });

  it("prices every row the file on disk reports", async () => {
    const { turns } = await piFamilyParser("pi").parse(PI_FILE);
    expect(turns.map((turn) => turn.harness)).toEqual(["pi", "pi", "pi"]);
    expect(turns.map(priced)).toEqual([
      { ref: "pi:pi-abc:msg_1", model: "anthropic/claude-fable-5-1", tokens: 230 },
      { ref: "pi:pi-abc:msg_2", model: "anthropic/claude-fable-5-1", tokens: 15 },
      // The last message names no model, so it carries the one the session switched to.
      { ref: "pi:pi-abc:msg_4", model: "openai/gpt-5-4", tokens: 42 },
    ]);
  });

  it("reads the same rows while the session is still being appended to", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-pi-live-"));
    try {
      const live = join(dir, "2026-09-01T10-00-00_abc.jsonl");
      const half =
        '{"type": "message", "id": "msg_5", "timestamp": "2026-09-01T10:00:08.000Z", "mess';
      await writeFile(live, `${await readFile(PI_FILE, "utf8")}${half}`, "utf8");

      const { turns, skipped } = await piFamilyParser("pi").parse(live);

      expect(turns.map((turn) => turn.ref)).toEqual([
        "pi:pi-abc:msg_1",
        "pi:pi-abc:msg_2",
        "pi:pi-abc:msg_4",
      ]);
      expect(skipped).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("builds the same refs on a second read, so a rescan inserts nothing twice", async () => {
    const first = await piFamilyParser("pi").parse(PI_FILE);
    const second = await piFamilyParser("pi").parse(PI_FILE);
    expect(second.turns.map((turn) => turn.ref)).toEqual(first.turns.map((turn) => turn.ref));
  });

  it("reads OMP's row under the session id OMP resumes from", async () => {
    const { turns, skipped } = await piFamilyParser("omp").parse(OMP_FILE);
    expect(skipped).toBe(0);
    expect(turns).toEqual([
      {
        harness: "omp",
        sessionId: "omp-session",
        cwd: "/tmp/omp",
        ts: "2026-05-01T10:08:32.000Z",
        model: "gpt-5.4-mini",
        tokensInput: 10,
        tokensOutput: 5,
        tokensCacheRead: null,
        tokensCacheWrite: null,
        ref: "omp:omp-session:4",
      },
    ]);
  });

  it("takes every `.jsonl` under the sessions directory and nothing else", () => {
    expect(piFamilyParser("pi").isTranscript("/home/u/.pi/agent/sessions/a.jsonl")).toBe(true);
    expect(piFamilyParser("pi").isTranscript("/home/u/.pi/agent/sessions/a.json")).toBe(false);
  });
});
