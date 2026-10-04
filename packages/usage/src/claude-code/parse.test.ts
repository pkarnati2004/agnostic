import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeCodeParser } from "./parse.js";

const PROJECTS = fileURLToPath(
  new URL("../../../../tests/fixtures/transcripts/claude-code/projects/", import.meta.url),
);

const petal = (name: string) => join(PROJECTS, "-Users-me-code-petal", name);

describe("claudeCodeParser", () => {
  it("reads one turn per assistant message, with the four buckets", async () => {
    const { turns } = await claudeCodeParser.parse(petal("s-aaaa.jsonl"));

    expect(turns).toHaveLength(3);
    expect(turns[0]).toEqual({
      harness: "claude-code",
      sessionId: "s-aaaa",
      cwd: "/Users/me/code/petal",
      ts: "2026-09-11T14:00:05.000Z",
      model: "claude-fable-5-1",
      tokensInput: 100,
      // The streamed copy of the same message reported 45; the first line had only 20.
      tokensOutput: 45,
      tokensCacheRead: 1000,
      tokensCacheWrite: 500,
      costUsd: null,
      ref: "claude-code:msg_a:req_a",
    });
  });

  it("keeps a turn that spent only cache tokens", async () => {
    const { turns } = await claudeCodeParser.parse(petal("s-aaaa.jsonl"));

    expect(turns[1]).toMatchObject({
      tokensInput: 0,
      tokensOutput: 0,
      tokensCacheRead: 800,
      costUsd: null,
      ref: "claude-code:msg_b:req_b",
    });
  });

  it("skips a turn that spent nothing at all", async () => {
    const { turns } = await claudeCodeParser.parse(petal("s-aaaa.jsonl"));

    expect(turns.map((turn) => turn.model)).not.toContain("<synthetic>");
  });

  it("counts the whole write bucket, not the hour-long part of it", async () => {
    const [first] = (await claudeCodeParser.parse(petal("s-aaaa.jsonl"))).turns;

    // cache_creation splits 500 into 200 at five minutes and 300 at an hour.
    expect(first?.tokensCacheWrite).toBe(500);
  });

  it("falls back to the file name for a record with no session id", async () => {
    const { turns } = await claudeCodeParser.parse(petal("s-aaaa.jsonl"));

    expect(turns[2]).toMatchObject({ sessionId: "s-aaaa", ref: "claude-code:msg_c:req_c" });
  });

  it("ignores user lines, including one that says assistant", async () => {
    const { turns } = await claudeCodeParser.parse(petal("s-aaaa.jsonl"));

    expect(turns.map((turn) => turn.ref)).toEqual([
      "claude-code:msg_a:req_a",
      "claude-code:msg_b:req_b",
      "claude-code:msg_c:req_c",
    ]);
  });

  it("gives a resumed session the refs of the turns it copied", async () => {
    const [original] = (await claudeCodeParser.parse(petal("s-aaaa.jsonl"))).turns;
    const [copy] = (await claudeCodeParser.parse(petal("s-cccc-fork.jsonl"))).turns;

    expect(copy?.ref).toBe(original?.ref);
    expect(copy?.sessionId).toBe("s-cccc");
  });

  it("returns the turns before a line that was cut off mid-write", async () => {
    const { turns } = await claudeCodeParser.parse(
      join(PROJECTS, "-tmp-elsewhere", "s-dddd.jsonl"),
    );

    expect(turns.map((turn) => turn.ref)).toEqual([
      "claude-code:msg_g:req_g",
      "claude-code:msg_h:req_h",
    ]);
  });

  it("takes only .jsonl files", () => {
    expect(claudeCodeParser.isTranscript("/h/.claude/projects/p/s.jsonl")).toBe(true);
    expect(claudeCodeParser.isTranscript("/h/.claude/projects/p/notes.md")).toBe(false);
  });
});

describe("claudeCodeParser on records it has not seen before", () => {
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agn-usage-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const parse = async (lines: unknown[]) => {
    const path = join(dir, "s-zzzz.jsonl");
    await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
    return claudeCodeParser.parse(path);
  };

  it("keys a record with no request id on the message id, then on the uuid", async () => {
    const { turns } = await parse([
      {
        type: "assistant",
        sessionId: "s-zzzz",
        timestamp: "2026-09-11T14:00:00.000Z",
        message: { id: "msg_x", model: "claude-sonnet-5", usage: { input_tokens: 3 } },
      },
      {
        type: "assistant",
        sessionId: "s-zzzz",
        timestamp: "2026-09-11T14:00:01.000Z",
        uuid: "u-1",
        message: { model: "claude-sonnet-5", usage: { output_tokens: 4 } },
      },
    ]);

    expect(turns.map((turn) => turn.ref)).toEqual([
      "claude-code:msg:msg_x",
      "claude-code:uuid:u-1",
    ]);
  });

  it("keys a record with no ids of its own on the file and line it was found on", async () => {
    const { turns } = await parse([
      {
        type: "assistant",
        sessionId: "s-zzzz",
        timestamp: "2026-09-11T14:00:00.000Z",
        message: { model: "claude-sonnet-5", usage: { input_tokens: 3 } },
      },
    ]);

    expect(turns[0]?.ref).toBe("claude-code:file:s-zzzz.jsonl:1");
  });

  it("attributes a sub-agent transcript to the parent session it ran under", async () => {
    // A sub-agent's own transcript file is named for itself, not the session that started it;
    // isSidechain records still carry the parent's sessionId, which is what agn attributes on.
    const path = join(dir, "sub-agent-of-s-zzzz.jsonl");
    await writeFile(
      path,
      `${JSON.stringify({
        type: "assistant",
        sessionId: "s-zzzz",
        isSidechain: true,
        timestamp: "2026-09-11T14:00:02.000Z",
        message: { id: "msg_sub", model: "claude-sonnet-5", usage: { input_tokens: 6 } },
      })}\n`,
      "utf8",
    );

    const { turns } = await claudeCodeParser.parse(path);

    expect(turns).toEqual([
      expect.objectContaining({ sessionId: "s-zzzz", ref: "claude-code:msg:msg_sub" }),
    ]);
  });

  it("skips a record with no timestamp", async () => {
    const { turns } = await parse([
      {
        type: "assistant",
        sessionId: "s-zzzz",
        message: { id: "msg_y", usage: { input_tokens: 3 } },
      },
    ]);

    expect(turns).toEqual([]);
  });
});
