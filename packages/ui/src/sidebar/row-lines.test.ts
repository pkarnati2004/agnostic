import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { childLine, rowSecondLine } from "./row-lines";

const TESTED: Pick<RepoListRow, "testCommand"> = { testCommand: "pnpm test" };
const UNTESTED: Pick<RepoListRow, "testCommand"> = { testCommand: null };

function task(over: Partial<TaskListRow>): TaskListRow {
  return taskRow({ branch: "agn/x", ...over });
}

describe("rowSecondLine", () => {
  it("shows the branch of a task with an agent on it", () => {
    expect(rowSecondLine(task({ status: "running" }), UNTESTED)).toEqual({
      text: "agn/x",
      mono: true,
      tone: "muted",
    });
    expect(rowSecondLine(task({ status: "waiting" }), UNTESTED).text).toBe("agn/x");
  });

  it("says what a queued task is waiting on, by the repo's own test command", () => {
    expect(rowSecondLine(task({ status: "queued" }), TESTED)).toEqual({
      text: "Running tests before launch",
      mono: false,
      tone: "queued",
    });
    expect(rowSecondLine(task({ status: "queued" }), UNTESTED).text).toBe("Starting");
    expect(rowSecondLine(task({ status: "queued" }), null).text).toBe("Starting");
  });

  it("says how a finished task ended, after the branch it ended on", () => {
    expect(rowSecondLine(task({ status: "stopped" }), UNTESTED)).toEqual({
      text: "agn/x · stopped",
      mono: true,
      tone: "muted",
    });
    expect(rowSecondLine(task({ status: "failed" }), UNTESTED)).toEqual({
      text: "agn/x · failed",
      mono: true,
      tone: "failed",
    });
    expect(rowSecondLine(task({ status: "done" }), UNTESTED).text).toBe("agn/x · done");
  });

  it("stands in for the branch a folder task never had", () => {
    expect(rowSecondLine(task({ status: "running", branch: null }), UNTESTED).text).toBe(
      "no branch",
    );
    expect(rowSecondLine(task({ status: "done", branch: null }), UNTESTED).text).toBe(
      "no branch · done",
    );
  });
});

describe("childLine", () => {
  it("names the harness the task was handed off from", () => {
    expect(childLine("claude-code:fable:native")).toEqual({
      text: "From claude-code",
      mono: false,
      tone: "muted",
    });
  });
});
