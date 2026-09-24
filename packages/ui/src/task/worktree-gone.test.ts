import { describe, expect, it } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { worktreeGone } from "./worktree-gone";

describe("worktreeGone", () => {
  it("is false while the worktree agn made is on disk", () => {
    expect(worktreeGone(taskRow())).toBe(false);
  });

  it("is true once that worktree is gone, whatever the task is doing", () => {
    expect(worktreeGone(taskRow({ worktreePresent: false }))).toBe(true);
    expect(worktreeGone(taskRow({ status: "running", worktreePresent: false }))).toBe(true);
  });

  it("is false for a folder task and for an adopted one: neither ever had a worktree", () => {
    const folder = taskRow({ worktreePath: null, worktreePresent: false, branch: null });
    expect(worktreeGone(folder)).toBe(false);
    expect(worktreeGone(taskRow({ worktreePath: null, worktreePresent: false }))).toBe(false);
  });
});
