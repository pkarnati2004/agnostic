import type { TaskListRow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { NO_USAGE, outcome } from "./compare-fixture";
import { changesCell, compareSummary, costCell, testsCell, timeCell } from "./compare-lines";

const NOW = Date.parse("2026-09-20T10:04:03.000Z");

function sibling(id: string, over: Partial<TaskListRow> = {}): TaskListRow {
  return taskRow({ id, compareId: "cmp1", worktreePath: `/tmp/wt/${id}`, ...over });
}

describe("compareSummary", () => {
  it("counts the agents by status, live first", () => {
    const two = { tasks: [sibling("a"), sibling("b")] };
    expect(compareSummary(two)).toBe("2 running");
    const mixed = { tasks: [sibling("a"), sibling("b", { status: "waiting" })] };
    expect(compareSummary(mixed)).toBe("1 running, 1 waiting");
    const stopped = { tasks: [sibling("a"), sibling("b", { status: "stopped" })] };
    expect(compareSummary(stopped)).toBe("1 running, 1 stopped");
  });

  // Only the daemon knows which sibling a pick kept, so a worktree removed by hand reads here as
  // the status it is in and nowhere as "picked".
  it("says nothing about a pick, whatever became of the worktrees", () => {
    const cleaned = {
      tasks: [sibling("a"), sibling("b", { status: "stopped", worktreePresent: false })],
    };
    expect(compareSummary(cleaned)).toBe("1 running, 1 stopped");
  });
});

describe("the cells the column and `agn compare show` share", () => {
  it("counts the files and the lines, and says nothing when git could not", () => {
    expect(changesCell({ files: 3, additions: 42, deletions: 7 })).toEqual({
      files: "3",
      lines: "+42 -7",
    });
    expect(changesCell(null)).toEqual({ files: "-", lines: "-" });
  });

  it("reads the tests the close work recorded", () => {
    expect(testsCell(outcome({ testsAfter: true }))).toBe("pass");
    expect(testsCell(outcome({ testsAfter: false }))).toBe("fail");
    expect(testsCell(outcome({ testsAfter: null }))).toBe("-");
    expect(testsCell(null)).toBe("-");
  });

  it("prices a run, or says the plan absorbed it", () => {
    expect(costCell({ ...NO_USAGE, costUsd: 0.12 }, "api-key")).toBe("$0.12");
    expect(costCell(NO_USAGE, "subscription")).toBe("in plan");
    expect(costCell(NO_USAGE, "local")).toBe("in plan");
    expect(costCell(NO_USAGE, "api-key")).toBe("-");
    expect(costCell(NO_USAGE, null)).toBe("-");
  });

  it("times a finished agent by its outcome and a live one by the clock", () => {
    const done = { status: "stopped" as const, createdAt: "2026-09-20T09:00:00.000Z" };
    expect(timeCell(done, outcome({ durationSec: 243 }), NOW)).toBe("4m 3s");
    expect(timeCell(done, outcome({ durationSec: 3723 }), NOW)).toBe("1h 2m 3s");
    expect(timeCell(done, outcome({ durationSec: 0 }), NOW)).toBe("0s");
    const live = { status: "running" as const, createdAt: "2026-09-20T10:00:00.000Z" };
    expect(timeCell(live, null, NOW)).toBe("4m 3s");
    // A stop whose outcome row has not landed yet still reads as wall time, never as a dash.
    expect(timeCell({ ...live, status: "stopped" }, null, NOW)).toBe("4m 3s");
  });
});
