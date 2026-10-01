import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import DatabaseConstructor from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ScanMemo, scanTranscripts, type TranscriptRoot } from "./scan-transcripts.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/transcripts/", import.meta.url));

/** Every `.jsonl` under the fixture home, for the tests that make them unreadable. */
async function transcriptFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** More transcripts than the scanner reads between two yields, spread over three projects. */
const MANY = 45;

function recordsFor(session: string): string {
  const lines = [0, 1].map((n) =>
    JSON.stringify({
      type: "assistant",
      sessionId: session,
      timestamp: `2026-09-11T14:0${n}:00.000Z`,
      cwd: "/Users/me/code/many",
      requestId: `req_${session}_${n}`,
      uuid: `u_${session}_${n}`,
      message: {
        id: `msg_${session}_${n}`,
        role: "assistant",
        model: "claude-fable-5-1",
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    }),
  );
  return `${lines.join("\n")}\n`;
}

/** The two refs the file for `session` holds, in the order its lines are written. */
function refsFor(session: string): string[] {
  return [0, 1].map((n) => `claude-code:msg_${session}_${n}:req_${session}_${n}`);
}

/** The transcripts, sorted by path: what a scan that never yielded would have read in order. */
async function manyTranscripts(dir: string): Promise<string[]> {
  const paths: string[] = [];
  for (let n = 0; n < MANY; n += 1) {
    const project = join(dir, `-Users-me-code-p${n % 3}`);
    await mkdir(project, { recursive: true });
    const session = `s-${String(n).padStart(2, "0")}`;
    const path = join(project, `${session}.jsonl`);
    await writeFile(path, recordsFor(session), "utf8");
    paths.push(path);
  }
  return paths.sort();
}

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

  it("carries one rate limit per file that had one", async () => {
    const dir = join(home, "codex/sessions/2026/09/24");
    await mkdir(dir, { recursive: true });
    const fixture = fileURLToPath(
      new URL("../../../tests/fixtures/usage/codex-rate-limits.jsonl", import.meta.url),
    );
    await cp(fixture, join(dir, "rollout-2026-09-24T11-58-00-0198d1f4.jsonl"));

    const { limits } = await scanTranscripts({ roots, memo, modifiedSince: null });

    // Only the new file carries one: the other rollouts under the fixture root report none.
    expect(limits).toEqual([expect.objectContaining({ harness: "codex", source: "rollout" })]);
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
    const first = await scanTranscripts({ roots, memo, modifiedSince: null });
    // Unreadable, so a rescan that opened any of them would report a problem for it.
    for (const file of await transcriptFiles(home)) {
      await chmod(file, 0o000);
    }

    const again = await scanTranscripts({ roots, memo, modifiedSince: null });

    expect(first.parsedFiles).toBeGreaterThan(0);
    expect(again).toMatchObject({ parsedFiles: 0, turns: [], problems: [] });
  });

  it("keeps skipping unchanged files when the floor has moved past them", async () => {
    await scanTranscripts({ roots, memo, modifiedSince: null });

    // What the daemon passes on every later scan: a floor computed from the time of that scan.
    const again = await scanTranscripts({ roots, memo, modifiedSince: Date.now() });

    expect(again.parsedFiles).toBe(0);
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

  describe("over a tree bigger than one yield", () => {
    let big: TranscriptRoot[] = [];
    let expected: string[] = [];

    beforeEach(async () => {
      const dir = join(home, "many");
      const paths = await manyTranscripts(dir);
      big = [{ harness: "claude-code", dir }];
      expected = paths.flatMap((path) => refsFor(basename(path, ".jsonl")));
    });

    it("reads every file, in the order and with the refs an unyielded scan would give", async () => {
      const { turns, parsedFiles, problems } = await scanTranscripts({
        roots: big,
        memo,
        modifiedSince: null,
      });

      expect({ parsedFiles, problems }).toEqual({ parsedFiles: MANY, problems: [] });
      expect(turns.map((turn) => turn.ref)).toEqual(expected);
    });

    it("opens nothing on a rescan, and repeats the same refs when the memo is empty", async () => {
      await scanTranscripts({ roots: big, memo, modifiedSince: null });

      const again = await scanTranscripts({ roots: big, memo, modifiedSince: null });
      // The ledger dedupes on the ref, so what makes a rescan safe is that the refs do not move.
      const fresh = await scanTranscripts({ roots: big, memo: new Map(), modifiedSince: null });

      expect(again).toMatchObject({ parsedFiles: 0, turns: [] });
      expect(fresh.turns.map((turn) => turn.ref)).toEqual(expected);
    });
  });

  describe("over a SQLite store", () => {
    let dir = "";

    beforeEach(async () => {
      dir = join(home, "opencode");
      await mkdir(dir, { recursive: true });
      const db = new DatabaseConstructor(join(dir, "opencode.db"));
      try {
        db.exec(await readFile(join(FIXTURES, "opencode", "schema.sql"), "utf8"));
        db.exec(await readFile(join(FIXTURES, "opencode", "rows.sql"), "utf8"));
      } finally {
        db.close();
      }
    });

    it("rereads a database whose write-ahead log has moved on without it", async () => {
      const roots: TranscriptRoot[] = [{ harness: "opencode", dir }];
      const first = await scanTranscripts({ roots, memo, modifiedSince: null });
      expect(first.parsedFiles).toBe(1);
      expect((await scanTranscripts({ roots, memo, modifiedSince: null })).parsedFiles).toBe(0);

      // The turns SQLite has not checkpointed yet live here, and the database file is untouched.
      await writeFile(join(dir, "opencode.db-wal"), "not really a log", "utf8");

      expect((await scanTranscripts({ roots, memo, modifiedSince: null })).parsedFiles).toBe(1);
    });
  });
});
