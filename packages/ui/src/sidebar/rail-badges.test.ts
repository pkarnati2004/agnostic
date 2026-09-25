import type { TaskListRow, TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { REPO } from "../test/workspace-fixture";
import { groupTasks } from "./group-tasks";
import { repoBadge, repoTasks } from "./rail-badges";

function rows(...statuses: TaskStatus[]): TaskListRow[] {
  return statuses.map((status, index) => taskRow({ id: `t${index}`, status }));
}

describe("repoBadge", () => {
  it("shows the worst of waiting, failed and running", () => {
    expect(repoBadge(rows("running", "failed", "waiting"))).toBe("waiting");
    expect(repoBadge(rows("running", "failed"))).toBe("failed");
    expect(repoBadge(rows("running", "done"))).toBe("running");
  });

  it("shows nothing for a repo whose tasks are queued or over", () => {
    expect(repoBadge(rows("queued", "done", "stopped"))).toBeNull();
    expect(repoBadge([])).toBeNull();
  });
});

describe("repoTasks", () => {
  it("counts a repo's live rows and its history alike", () => {
    const live = taskRow({ id: "live", repoId: REPO.id, status: "waiting" });
    const over = taskRow({
      id: "over",
      repoId: REPO.id,
      status: "failed",
      worktreePresent: false,
    });
    const group = groupTasks([REPO], [live, over]).repos[0];
    expect(group).toBeDefined();
    const found = group === undefined ? [] : repoTasks(group);
    expect(found.map((task) => task.id).sort()).toEqual(["live", "over"]);
    expect(repoBadge(found)).toBe("waiting");
  });
});
