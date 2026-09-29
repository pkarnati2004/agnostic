// How `groupTasks` folds the siblings of one compare into a single sidebar row.
import type { RepoListRow, TaskListRow, TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { groupTasks, type RepoGroup, type SidebarRow } from "./group-tasks";

const PETAL: RepoListRow = {
  id: "r1",
  name: "petal",
  path: "/tmp/petal",
  kind: "git",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

function task(id: string, status: TaskStatus, minute: number): TaskListRow {
  return {
    id,
    repoId: PETAL.id,
    title: id,
    prompt: id,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: `/tmp/wt/${id}`,
    branch: `agn/${id}`,
    status,
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: `2026-09-14T09:${String(minute).padStart(2, "0")}:00.000Z`,
    updatedAt: `2026-09-14T10:${String(minute).padStart(2, "0")}:00.000Z`,
    worktreePresent: true,
  };
}

function sibling(id: string, minute: number, over: Partial<TaskListRow> = {}): TaskListRow {
  return { ...task(id, "running", minute), compareId: "cmp1", title: "Try two parsers", ...over };
}

/** The ids the sidebar draws in order: a task by its own id, a compare by its group's. */
function ids(rows: SidebarRow[] | undefined): string[] {
  return (rows ?? []).map((row) => (row.kind === "task" ? row.task.id : row.group.compareId));
}

function groupOf(group: RepoGroup | undefined, compareId: string) {
  const row = [...(group?.rows ?? []), ...(group?.history ?? [])].find(
    (one) => one.kind === "compare" && one.group.compareId === compareId,
  );
  return row?.kind === "compare" ? row.group : null;
}

const SIBLINGS = [sibling("sib-a", 20), sibling("sib-b", 30)];

describe("a compare group", () => {
  it("is one row, its siblings oldest first, named by the first of them", () => {
    const group = groupTasks([PETAL], SIBLINGS).repos[0];
    expect(ids(group?.rows)).toEqual(["cmp1"]);
    expect(groupOf(group, "cmp1")?.title).toBe("Try two parsers");
    expect(groupOf(group, "cmp1")?.tasks.map((one) => one.id)).toEqual(["sib-a", "sib-b"]);
  });

  it("sits among the task rows by its newest sibling", () => {
    const rows = groupTasks([PETAL], [...SIBLINGS, task("older", "running", 25)]).repos[0];
    expect(ids(rows?.rows)).toEqual(["cmp1", "older"]);
  });

  it("stays in the list while one sibling is not in History", () => {
    const half = [
      sibling("sib-a", 20, { status: "stopped", worktreePresent: false }),
      sibling("sib-b", 30),
    ];
    const group = groupTasks([PETAL], half).repos[0];
    expect(ids(group?.rows)).toEqual(["cmp1"]);
    expect(ids(group?.history)).toEqual([]);
  });

  it("moves to History once every sibling is there", () => {
    const done = SIBLINGS.map((one) => ({
      ...one,
      status: "stopped" as const,
      worktreePresent: false,
    }));
    const group = groupTasks([PETAL], done).repos[0];
    expect(ids(group?.rows)).toEqual([]);
    expect(ids(group?.history)).toEqual(["cmp1"]);
  });

  it("leaves a waiting sibling in Needs you on its own", () => {
    const waiting = [sibling("sib-a", 20, { status: "waiting" }), sibling("sib-b", 30)];
    const groups = groupTasks([PETAL], waiting);
    expect(groups.needsYou.map((one) => one.id)).toEqual(["sib-a"]);
    expect(ids(groups.repos[0]?.rows)).toEqual(["cmp1"]);
  });

  it("leaves tasks with no compare where they were", () => {
    const group = groupTasks([PETAL], [task("alone", "running", 20)]).repos[0];
    expect(ids(group?.rows)).toEqual(["alone"]);
  });
});
