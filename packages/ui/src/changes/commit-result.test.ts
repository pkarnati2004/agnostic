import type { AskCommitResponse } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "./changes-fixture";
import { canAskCommit, commitLine } from "./commit-result";

function response(via: AskCommitResponse["via"]): AskCommitResponse {
  return { task: taskRow(), via, prompt: "Commit your work on `agn/invite-links-a1b2`." };
}

describe("commitLine", () => {
  it("says the prompt went into the session that was already running", () => {
    expect(commitLine(response("live"))).toBe(
      "Asked the agent to commit in its session. Refresh shows the commit once it lands.",
    );
  });

  it("says the task was resumed for it, either way the resume went", () => {
    const resumed =
      "Resumed the task and asked it to commit. Refresh shows the commit once it lands.";
    expect(commitLine(response("native"))).toBe(resumed);
    expect(commitLine(response("fresh"))).toBe(resumed);
  });
});

describe("canAskCommit", () => {
  it("is true for a live task with uncommitted work, and for a resumable one", () => {
    expect(canAskCommit(taskRow({ status: "running" }), 2)).toBe(true);
    expect(canAskCommit(taskRow({ status: "waiting" }), 2)).toBe(true);
    expect(canAskCommit(taskRow({ status: "stopped" }), 2)).toBe(true);
  });

  it("is false with nothing uncommitted, and false before the panel has read the task", () => {
    expect(canAskCommit(taskRow({ status: "running" }), 0)).toBe(false);
    expect(canAskCommit(taskRow({ status: "running" }), null)).toBe(false);
  });

  it("is false once the worktree is gone: a resume has to rebuild it first", () => {
    expect(canAskCommit(taskRow({ status: "stopped", worktreePresent: false }), 2)).toBe(false);
  });

  it("is false for a folder task and for an adopted one, which have no worktree of agn's", () => {
    const folder = taskRow({ branch: null, worktreePath: null, worktreePresent: false });
    expect(canAskCommit(folder, 2)).toBe(false);
    expect(canAskCommit(taskRow({ worktreePath: null, worktreePresent: false }), 2)).toBe(false);
  });

  it("is false for a queued task: there is no agent in the session yet", () => {
    expect(canAskCommit(taskRow({ status: "queued" }), 2)).toBe(false);
  });
});
