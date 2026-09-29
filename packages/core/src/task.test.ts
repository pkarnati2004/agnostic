import { describe, expect, it } from "vitest";
import { type Task, TaskSchema, type TaskSession, TaskSessionSchema } from "./task.js";

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "Split the recommender scoring out of the daemon",
  prompt: "Move scoring into packages/recommender and keep the daemon route thin.",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/t3n9v2wxyz",
  status: "running",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:31:00.000Z",
};

describe("TaskSchema", () => {
  it("parses a task without a recommendation or parent", () => {
    expect(TaskSchema.parse(task)).toEqual(task);
  });

  it("accepts a null worktree and branch for a queued task", () => {
    const queued: Task = { ...task, status: "queued", worktreePath: null, branch: null };
    expect(TaskSchema.parse(queued)).toEqual(queued);
  });

  it("accepts an optional recommendation and parent task", () => {
    const handoff: Task = {
      ...task,
      parentTaskId: "p4k8m2qrst",
      recommendation: {
        recommended: {
          profileId: "codex:gpt-5:native",
          reason: "stronger on test repair",
          evidence: "some",
          sources: [],
        },
        alternative: null,
        worthTrying: null,
        riskNote: null,
        taskClass: {
          intent: "debug",
          scope: "small",
          risk: [],
          needsBrowser: false,
          automaticIntent: null,
        },
      },
    };
    expect(TaskSchema.parse(handoff)).toEqual(handoff);
  });

  it("defaults origin to agn so rows written before adoption existed still parse", () => {
    const { origin, ...withoutOrigin } = task;
    expect(origin).toBe("agn");
    expect(TaskSchema.parse(withoutOrigin).origin).toBe("agn");
  });

  it("defaults compareId to null so a row written before `agn compare` still parses", () => {
    const { compareId, ...withoutCompareId } = task;
    expect(compareId).toBeNull();
    expect(TaskSchema.parse(withoutCompareId).compareId).toBeNull();
  });

  it("accepts an adopted task with a captured session", () => {
    const session: TaskSession = {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      launchId: null,
      pid: null,
      cwd: "/Users/dev/code/agnostic",
      lastSeenAt: "2026-09-10T12:31:00.000Z",
    };
    const adopted: Task = { ...task, origin: "adopted", session };
    expect(TaskSchema.parse(adopted)).toEqual(adopted);
  });

  it("requires cwd on a session even when every other field is present", () => {
    const session: TaskSession = {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      launchId: null,
      pid: null,
      cwd: "/Users/dev/code/agnostic",
      lastSeenAt: "2026-09-10T12:31:00.000Z",
    };
    expect(TaskSessionSchema.parse(session)).toEqual(session);
    const { cwd: _cwd, ...withoutCwd } = session;
    expect(TaskSessionSchema.safeParse(withoutCwd).success).toBe(false);
    expect(TaskSessionSchema.safeParse({ ...session, cwd: "" }).success).toBe(false);
  });

  it("defaults tmuxSocket to null so rows written before the private socket still parse", () => {
    const old = {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      cwd: "/Users/dev/code/agnostic",
      lastSeenAt: "2026-09-10T12:31:00.000Z",
    };
    expect(TaskSessionSchema.parse(old).tmuxSocket).toBeNull();
  });

  it("defaults pid to null so rows written before adoption still parse", () => {
    const old = {
      harness: "claude-code",
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      launchId: null,
      cwd: "/Users/dev/code/agnostic",
      lastSeenAt: "2026-09-10T12:31:00.000Z",
    };
    expect(TaskSessionSchema.parse(old).pid).toBeNull();
  });

  it("accepts a session that is not under tmux, which is what adopt records for a bare terminal", () => {
    const outside = {
      harness: "claude-code" as const,
      sessionId: null,
      tmuxSession: null,
      tmuxSocket: null,
      launchId: null,
      pid: 4211,
      cwd: "/Users/dev/code/agnostic",
      lastSeenAt: "2026-09-10T12:31:00.000Z",
    };
    expect(TaskSessionSchema.parse(outside)).toEqual(outside);
    expect(TaskSessionSchema.safeParse({ ...outside, pid: 0 }).success).toBe(false);
  });

  it("rejects the wrong type in every field", () => {
    const wrong: Record<string, unknown> = {
      id: "nope",
      repoId: 7,
      title: "",
      prompt: null,
      profileId: 7,
      worktreePath: 7,
      branch: 7,
      status: "thinking",
      origin: "imported",
      createdAt: "yesterday",
      updatedAt: 0,
      recommendation: { recommended: {} },
      session: { harness: "claude-code" },
      parentTaskId: "nope",
      compareId: "nope",
    };
    for (const [field, value] of Object.entries(wrong)) {
      expect(TaskSchema.safeParse({ ...task, [field]: value }).success).toBe(false);
    }
  });
});
