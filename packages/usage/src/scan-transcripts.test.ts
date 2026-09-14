import { chmod, cp, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ScanMemo, scanTranscripts, type TranscriptRoot } from "./scan-transcripts.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/transcripts/", import.meta.url));

describe("scanTranscripts", () => {
  let home = "";
  let roots: TranscriptRoot[] = [];
  let memo: ScanMemo = new Map();

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agn-transcripts-"));
    await cp(FIXTURES, home, { recursive: true });
    roots = [
      { harness: "claude-code", dir: join(home, "claude-code/projects") },
      { harness: "codex", dir: join(home, "codex/sessions") },
    ];
    memo = new Map();
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("reads every transcript under every root", async () => {
    const { turns, parsedFiles, problems } = await scanTranscripts({
      roots,
      memo,
      modifiedSince: null,
    });

    expect(problems).toEqual([]);
    expect(parsedFiles).toBe(7);
    expect(turns.filter((turn) => turn.harness === "claude-code")).toHaveLength(8);
    expect(turns.filter((turn) => turn.harness === "codex")).toHaveLength(3);
  });

  it("counts the turns that reported a total and no buckets", async () => {
    const desktop = {
      timestamp: "2026-09-11T22:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: { last_token_usage: { input_tokens: 0, output_tokens: 0, total_tokens: 194_999 } },
      },
    };
    await writeFile(
      join(
        home,
        "codex/sessions/2026/09/11/rollout-2026-09-11T22-00-00-01a09000-0000-7000-8000-00000000000c.jsonl",
      ),
      `${JSON.stringify(desktop)}\n`,
      "utf8",
    );

    const { turns, skipped } = await scanTranscripts({ roots, memo, modifiedSince: null });

    expect(skipped).toBe(1);
    expect(turns.filter((turn) => turn.harness === "codex")).toHaveLength(3);
  });

  it("opens nothing the second time when nothing has changed", async () => {
    await scanTranscripts({ roots, memo, modifiedSince: null });

    const again = await scanTranscripts({ roots, memo, modifiedSince: null });

    expect(again).toMatchObject({ parsedFiles: 0, turns: [], problems: [] });
  });

  it("reopens only the file that changed", async () => {
    await scanTranscripts({ roots, memo, modifiedSince: null });
    const touched = join(home, "claude-code/projects/-Users-me-code-petal/s-bbbb.jsonl");
    const later = new Date(Date.now() + 60_000);
    await utimes(touched, later, later);

    const again = await scanTranscripts({ roots, memo, modifiedSince: null });

    expect(again.parsedFiles).toBe(1);
    expect(again.turns.map((turn) => turn.sessionId)).toEqual(["s-bbbb"]);
  });

  it("reads nothing older than the floor it was given", async () => {
    const { turns, parsedFiles } = await scanTranscripts({
      roots,
      memo,
      modifiedSince: Date.now() + 60_000,
    });

    expect({ turns, parsedFiles }).toEqual({ turns: [], parsedFiles: 0 });
  });

  it("has nothing to say about a root with no transcripts, or one that is not there", async () => {
    const { turns, problems } = await scanTranscripts({
      roots: [
        { harness: "claude-code", dir: join(home, "empty") },
        { harness: "codex", dir: join(home, "never-ran") },
      ],
      memo,
      modifiedSince: null,
    });

    expect({ turns, problems }).toEqual({ turns: [], problems: [] });
  });

  it("reports a file it cannot read and returns the rest", async () => {
    const unreadable = join(home, "claude-code/projects/-Users-me-code-petal/s-bbbb.jsonl");
    await chmod(unreadable, 0o000);

    const { turns, problems } = await scanTranscripts({ roots, memo, modifiedSince: null });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe("transcript-unreadable");
    expect(turns.filter((turn) => turn.harness === "claude-code")).toHaveLength(7);
  });

  it("skips a harness that has no parser", async () => {
    const { turns } = await scanTranscripts({
      roots: [{ harness: "pi", dir: join(home, "claude-code/projects") }],
      memo,
      modifiedSince: null,
    });

    expect(turns).toEqual([]);
  });
});
