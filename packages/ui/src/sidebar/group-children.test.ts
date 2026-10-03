import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { groupTasks, type SidebarRow } from "./group-tasks";

function repo(id: string, name: string): RepoListRow {
  return {
    id,
    name,
    path: `/tmp/${name}`,
    kind: "git",
    addedAt: "2026-09-01T00:00:00.000Z",
    status: "active",
    testCommand: null,
    pathPresent: true,
  };
}

function task(
  id: string,
  repoId: string,
  status: TaskListRow["status"],
  minute: number,
): TaskListRow {
  return {
    id,
    repoId,
    title: id,
    prompt: id,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: `/tmp/wt/${id}`,
    branch: "agn/one",
    status,
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: `2026-09-14T10:${String(minute).padStart(2, "0")}:00.000Z`,
    worktreePresent: true,
  };
}

/** The ids the sidebar draws in order: a task by its own id, a compare by its group's. */
function ids(rows: SidebarRow[] | undefined): string[] {
  return (rows ?? []).map((row) => (row.kind === "task" ? row.task.id : row.group.compareId));
}

/** `agn handoff` stops one task and starts another on the same branch; the sidebar draws the pair. */
describe("a task handed off from another", () => {
  const PARENT = task("parent", "r1", "stopped", 10);
  const CHILD = { ...task("child", "r1", "running", 20), parentTaskId: "parent" };

  function rowsOf(tasks: TaskListRow[]): SidebarRow[] {
    return groupTasks([repo("r1", "petal")], tasks)?.repos[0]?.rows ?? [];
  }

  it("rides on its parent's row while both are live in the repo", () => {
    const rows = rowsOf([PARENT, CHILD]);
    expect(ids(rows)).toEqual(["parent"]);
    const first = rows[0];
    expect(first?.kind === "task" && first.child?.id).toBe("child");
  });

  it("sorts by time on its own once the parent is in History", () => {
    const gone = { ...PARENT, worktreePresent: false };
    const rows = rowsOf([gone, CHILD]);
    expect(ids(rows)).toEqual(["child"]);
    const first = rows[0];
    expect(first?.kind === "task" && first.child).toBeNull();
  });

  it("sorts by time on its own when the parent is in another repo", () => {
    const groups = groupTasks(
      [repo("r1", "petal"), repo("r2", "katha")],
      [PARENT, { ...CHILD, repoId: "r2" }],
    );
    expect(ids(groups.repos[0]?.rows)).toEqual(["child"]);
    expect(ids(groups.repos[1]?.rows)).toEqual(["parent"]);
  });

  it("pairs one handoff of a chain and leaves the rest to sort by time", () => {
    // Three tasks on one branch would be three indents; the newest pair takes the indent and the
    // task above it keeps its own row.
    const grandchild = { ...task("grandchild", "r1", "running", 30), parentTaskId: "child" };
    const rows = rowsOf([PARENT, CHILD, grandchild]);
    expect(ids(rows)).toEqual(["child", "parent"]);
    const childRow = rows[0];
    expect(childRow?.kind === "task" && childRow.child?.id).toBe("grandchild");
    const parentRow = rows[1];
    expect(parentRow?.kind === "task" && parentRow.child).toBeNull();
  });
});
