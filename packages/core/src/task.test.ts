import { describe, expect, it } from "vitest";
import { type Task, TaskSchema } from "./task.js";

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "Split the recommender scoring out of the daemon",
  prompt: "Move scoring into packages/recommender and keep the daemon route thin.",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/t3n9v2wxyz",
  status: "running",
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
      },
    };
    expect(TaskSchema.parse(handoff)).toEqual(handoff);
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
      createdAt: "yesterday",
      updatedAt: 0,
      recommendation: { recommended: {} },
      parentTaskId: "nope",
    };
    for (const [field, value] of Object.entries(wrong)) {
      expect(TaskSchema.safeParse({ ...task, [field]: value }).success).toBe(false);
    }
  });
});
