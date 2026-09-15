import type { Task, TaskSession } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { sessionTarget } from "./terminal-phase";

const SESSION: TaskSession = {
  harness: "claude-code",
  sessionId: null,
  tmuxSession: "agn-t1",
  tmuxSocket: "agn",
  launchId: null,
  pid: null,
  cwd: "/tmp/work",
  lastSeenAt: "2026-09-14T10:00:00.000Z",
};

function task(patch: Partial<Task>): Task {
  return {
    id: "t1",
    repoId: "r1",
    title: "Add the retry budget",
    prompt: "add the retry budget",
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: null,
    branch: null,
    status: "running",
    origin: "agn",
    baseCommit: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    ...patch,
  };
}

describe("sessionTarget", () => {
  it("waits for a queued task", () => {
    expect(sessionTarget(task({ status: "queued" }))).toBe("starting");
  });

  it("attaches to a live one", () => {
    expect(sessionTarget(task({ status: "running", session: SESSION }))).toBe("attach");
    expect(sessionTarget(task({ status: "waiting", session: SESSION }))).toBe("attach");
    expect(sessionTarget(task({ status: "running" }))).toBe("attach");
  });

  it("offers a resume for one that has finished", () => {
    expect(sessionTarget(task({ status: "done" }))).toBe("ended");
    expect(sessionTarget(task({ status: "failed" }))).toBe("ended");
    expect(sessionTarget(task({ status: "stopped" }))).toBe("ended");
  });

  it("never opens a socket on a session outside tmux", () => {
    const session: TaskSession = { ...SESSION, tmuxSession: null, pid: 4242 };
    expect(sessionTarget(task({ status: "running", session }))).toBe("unattachable");
  });
});
