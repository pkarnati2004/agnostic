import { describe, expect, it } from "vitest";
import { sessionHandle } from "./executor.js";
import type { Task, TaskSession } from "./task.js";

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "Add a --verbose flag",
  prompt: "Add a --verbose flag to the CLI.",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/add-a-verbose-flag-t3n9v2wxyz",
  status: "running",
  origin: "agn",
  createdAt: "2026-09-10T12:30:00.000Z",
  updatedAt: "2026-09-10T12:30:00.000Z",
};

const session: TaskSession = {
  harness: "claude-code",
  sessionId: null,
  tmuxSession: "agn-t3n9v2wxyz",
  tmuxSocket: "agn",
  cwd: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  lastSeenAt: "2026-09-10T12:31:00.000Z",
};

describe("sessionHandle", () => {
  it("rebuilds the handle from the task's session", () => {
    expect(sessionHandle({ ...task, session })).toEqual({
      taskId: "t3n9v2wxyz",
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      cwd: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
    });
  });

  it("keeps the null socket of an adopted session on the default server", () => {
    const adopted = {
      ...task,
      origin: "adopted" as const,
      session: { ...session, tmuxSocket: null },
    };
    expect(sessionHandle(adopted)?.tmuxSocket).toBeNull();
  });

  it("is null for a task that has no session yet", () => {
    expect(sessionHandle(task)).toBeNull();
  });
});
