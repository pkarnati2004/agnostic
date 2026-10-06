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

  it("names the panel's own actions the way their buttons do", () => {
    const task = { title: "Add invite links" };
    expect(noticeLine(notice({ action: "open" }), task)).toContain("Open in editor failed");
    expect(noticeLine(notice({ action: "pr" }), task)).toContain("Create PR failed");
    expect(noticeLine(notice({ action: "update" }), task)).toContain("Bring up to date failed");
  });

  it("names Archive and Delete as the menu and the dialog do", () => {
    const task = { title: "Add invite links" };
    expect(noticeLine(notice({ action: "archive" }), task)).toContain("Archive failed");
    expect(noticeLine(notice({ action: "delete" }), task)).toContain("Delete failed");
  });

  it("says Hand off the way the button does", () => {
    expect(noticeLine(notice({ action: "handoff" }), { title: "Cache rows" })).toContain(
      "Hand off failed for Cache rows",
    );
  });
});
