import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { noticeLine, type TaskNotice } from "./task-notices";

function notice(over: Partial<TaskNotice> = {}): TaskNotice {
  return {
    action: "resume",
    host: "header",
    error: new ApiError("the worktree is gone", { code: "worktree-missing", status: 409 }),
    at: 1000,
    ...over,
  };
}

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
