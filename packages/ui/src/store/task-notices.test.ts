import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import {
  type NoticeHost,
  noticeLine,
  noticesReducer,
  type TaskAction,
  type TaskNotice,
} from "./task-notices";

function notice(over: Partial<TaskNotice> = {}): TaskNotice {
  return {
    action: "resume" as TaskAction,
    host: "header" as NoticeHost,
    error: new ApiError("the worktree is gone", { code: "worktree-missing", status: 409 }),
    at: 1000,
    ...over,
  };
}

describe("noticesReducer", () => {
  it("keeps the latest failure for a task and nothing older", () => {
    const first = notice({ action: "stop", at: 1000 });
    const second = notice({ action: "resume", at: 2000 });
    const state = noticesReducer({ t1: first }, { type: "failed", taskId: "t1", notice: second });
    expect(state.t1).toBe(second);
  });

  it("holds one notice per task", () => {
    const state = noticesReducer(
      { t1: notice() },
      { type: "failed", taskId: "t2", notice: notice({ at: 2000 }) },
    );
    expect(Object.keys(state).sort()).toEqual(["t1", "t2"]);
  });

  it("clears a task's notice when its next action succeeds", () => {
    const state = noticesReducer({ t1: notice(), t2: notice() }, { type: "cleared", taskId: "t1" });
    expect(state).toEqual({ t2: notice() });
  });

  it("leaves a task with no notice alone", () => {
    const before = { t1: notice() };
    expect(noticesReducer(before, { type: "cleared", taskId: "t2" })).toBe(before);
  });

  it("expires the notice the timer was started for", () => {
    const state = noticesReducer({ t1: notice({ at: 1000 }) }, expired("t1", 1000));
    expect(state).toEqual({});
  });

  it("leaves a newer notice for a stale timer to find", () => {
    const later = { t1: notice({ at: 2000 }) };
    expect(noticesReducer(later, expired("t1", 1000))).toBe(later);
  });
});

describe("noticeLine", () => {
  it("names the action, the task and what the daemon said", () => {
    const line = noticeLine(notice({ action: "resume" }), { title: "Port the parser" });
    expect(line).toBe("Resume failed for Port the parser: the worktree is gone");
  });

  it("says Hand off the way the button does", () => {
    expect(noticeLine(notice({ action: "handoff" }), { title: "Cache rows" })).toContain(
      "Hand off failed for Cache rows",
    );
  });
});

function expired(taskId: string, at: number) {
  return { type: "expired" as const, taskId, at };
}
