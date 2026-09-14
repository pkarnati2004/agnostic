import { describe, expect, it } from "vitest";
import { attributeTurns, type SessionOwner } from "./attribute-turns.js";
import type { TranscriptTurn } from "./transcript-parser.js";

function turn(overrides: Partial<TranscriptTurn> = {}): TranscriptTurn {
  return {
    harness: "claude-code",
    sessionId: "s-aaaa",
    cwd: "/Users/me/code/petal",
    ts: "2026-09-11T14:00:00.000Z",
    model: "claude-fable-5-1",
    tokensInput: 10,
    tokensOutput: 5,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    ref: "claude-code:msg_a:req_a",
    ...overrides,
  };
}

function owner(overrides: Partial<SessionOwner> = {}): SessionOwner {
  return {
    taskId: "t3n9v2wxyz",
    harness: "claude-code",
    sessionId: "s-aaaa",
    cwd: "/Users/me/code/petal",
    startedAt: "2026-09-11T13:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

describe("attributeTurns", () => {
  it("matches the harness's own session id before anything else", () => {
    const mine = turn();
    const attributed = attributeTurns(
      [mine],
      [
        owner({ taskId: "t-session" }),
        owner({ taskId: "t-directory", sessionId: null, startedAt: "2026-09-11T13:30:00.000Z" }),
      ],
    );

    expect(attributed.get("t-session")).toEqual([mine]);
    expect(attributed.has("t-directory")).toBe(false);
  });

  it("falls back to the directory the turn ran in", () => {
    const mine = turn({ sessionId: "s-unknown" });

    const attributed = attributeTurns([mine], [owner({ sessionId: null })]);

    expect(attributed.get("t3n9v2wxyz")).toEqual([mine]);
  });

  it("ignores a directory match from before the task held it", () => {
    const mine = turn({ sessionId: "s-unknown", ts: "2026-09-11T12:00:00.000Z" });

    const attributed = attributeTurns([mine], [owner({ sessionId: null })]);

    expect(attributed.get(null)).toEqual([mine]);
  });

  it("ignores a directory match from after the task ended", () => {
    const mine = turn({ sessionId: "s-unknown", ts: "2026-09-11T18:00:00.000Z" });

    const attributed = attributeTurns(
      [mine],
      [owner({ sessionId: null, endedAt: "2026-09-11T15:00:00.000Z" })],
    );

    expect(attributed.get(null)).toEqual([mine]);
  });

  it("gives a directory two tasks have held to the newer one", () => {
    const mine = turn({ sessionId: "s-unknown", ts: "2026-09-11T16:00:00.000Z" });

    const attributed = attributeTurns(
      [mine],
      [
        owner({ taskId: "t-older", sessionId: null, endedAt: null }),
        owner({
          taskId: "t-newer",
          sessionId: null,
          startedAt: "2026-09-11T15:30:00.000Z",
        }),
      ],
    );

    expect(attributed.get("t-newer")).toEqual([mine]);
  });

  it("does not give one harness's turn to another harness's task", () => {
    const mine = turn({ harness: "codex", sessionId: "thread-1" });

    const attributed = attributeTurns([mine], [owner({ sessionId: null })]);

    expect(attributed.get(null)).toEqual([mine]);
  });

  it("puts a turn that matches nothing under no task", () => {
    const mine = turn({ sessionId: "s-dddd", cwd: "/tmp/elsewhere" });

    const attributed = attributeTurns([mine], [owner()]);

    expect([...attributed.keys()]).toEqual([null]);
  });

  it("groups every turn under the task that owns it", () => {
    const first = turn();
    const second = turn({ ref: "claude-code:msg_b:req_b" });
    const stranger = turn({ sessionId: "s-dddd", cwd: null });

    const attributed = attributeTurns([first, second, stranger], [owner()]);

    expect(attributed.get("t3n9v2wxyz")).toEqual([first, second]);
    expect(attributed.get(null)).toEqual([stranger]);
  });
});
