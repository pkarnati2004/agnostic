import type { RepoListRow, Task, TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { groupTasks } from "./group-tasks";

function repo(id: string, name: string): RepoListRow {
  return {
    id,
    name,
    path: `/tmp/${name}`,
    kind: "git",
    addedAt: "2026-09-01T00:00:00.000Z",
    testCommand: null,
  };
}

function task(id: string, repoId: string, status: TaskStatus, minute: number): Task {
  const at = `2026-09-14T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return {
    id,
    repoId,
    title: id,
    prompt: id,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: null,
    branch: null,
    status,
    origin: "agn",
    baseCommit: null,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: at,
  };
}

// Two repos out of name order, one of them empty, and every status represented once.
const PETAL = repo("r2", "Petal");
const KATHA = repo("r1", "katha");
const EMPTY = repo("r3", "zephyr");
const TASKS = [
  task("waiting-new", "r1", "waiting", 40),
  task("waiting-old", "r2", "waiting", 10),
  task("running", "r2", "running", 20),
  task("queued", "r2", "queued", 5),
  task("done", "r2", "done", 50),
  task("failed", "r2", "failed", 30),
  task("stopped", "r2", "stopped", 55),
];

describe("groupTasks", () => {
  const groups = groupTasks([PETAL, KATHA, EMPTY], TASKS);

  it("puts the oldest unanswered question first in Needs you", () => {
    expect(groups.needsYou.map((one) => one.id)).toEqual(["waiting-old", "waiting-new"]);
  });

  it("lists repos by name, ignoring case", () => {
    expect(groups.repos.map((group) => group.repo.name)).toEqual(["katha", "Petal", "zephyr"]);
  });

  it("puts a repo's open tasks first, each newest first", () => {
    expect(groups.repos[1]?.tasks.map((one) => one.id)).toEqual([
      "running",
      "waiting-old",
      "queued",
      "stopped",
      "done",
      "failed",
    ]);
  });

  it("keeps a waiting task under its repo as well", () => {
    expect(groups.needsYou[0]?.id).toBe("waiting-old");
    expect(groups.repos[1]?.tasks.map((one) => one.id)).toContain("waiting-old");
  });

  it("lists a repo with no tasks", () => {
    expect(groups.repos[2]).toEqual({ repo: EMPTY, tasks: [] });
  });
});
