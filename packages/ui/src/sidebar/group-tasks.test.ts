import type { RepoListRow, TaskListRow, TaskStatus } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { activeRepos, closedRepos, groupTasks, inHistory, inSidebarOrder } from "./group-tasks";

function repo(id: string, name: string): RepoListRow {
  return {
    id,
    name,
    path: `/tmp/${name}`,
    kind: "git",
    addedAt: "2026-09-01T00:00:00.000Z",
    status: "active",
    testCommand: null,
  };
}

function task(id: string, repoId: string, status: TaskStatus, minute: number): TaskListRow {
  const at = `2026-09-14T10:${String(minute).padStart(2, "0")}:00.000Z`;
  return {
    id,
    repoId,
    title: id,
    prompt: id,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: `/tmp/wt/${id}`,
    branch: null,
    status,
    origin: "agn",
    baseCommit: null,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: at,
    worktreePresent: true,
  };
}

/** The daemon found no directory at the path the row keeps: agn clean, the sweep, or an rm -rf. */
function goneTask(id: string, repoId: string, status: TaskStatus, minute: number): TaskListRow {
  return { ...task(id, repoId, status, minute), worktreePresent: false };
}

/** A folder or adopted task never had a worktree of agn's, so it has none to lose. */
function folderTask(id: string, repoId: string, status: TaskStatus, minute: number): TaskListRow {
  return { ...task(id, repoId, status, minute), worktreePath: null, worktreePresent: false };
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
    expect(groups.repos[2]).toEqual({ repo: EMPTY, tasks: [], history: [] });
  });

  // A new task defaults to the first repo on the left, which is this order's first, not the store's.
  it("orders repos for the sidebar whatever order the store holds", () => {
    expect(inSidebarOrder([PETAL, KATHA, EMPTY]).map((one) => one.name)).toEqual([
      "katha",
      "Petal",
      "zephyr",
    ]);
  });
});

describe("a closed repo", () => {
  const CLOSED = { ...PETAL, status: "archived" } as const;
  // The list the page loads with, closed repos and all, which is what `GET /repos?all=1` returns.
  const groups = groupTasks([CLOSED, KATHA], TASKS);

  it("is listed for the Closed section, by name, and nowhere else", () => {
    const closed = { ...KATHA, id: "r4", name: "Aster", status: "archived" } as const;
    expect(closedRepos([CLOSED, KATHA, closed]).map((one) => one.name)).toEqual(["Aster", "Petal"]);
    expect(closedRepos([KATHA])).toEqual([]);
  });

  it("keeps its waiting task off a reloaded page: the repo is in the list, so the task is not", () => {
    // The bug this fixes: with a bare `GET /repos` the page never saw the closed row, so nothing
    // told it which tasks to leave out and a waiting one sat under "Needs you" after every reload.
    expect(groups.needsYou.map((one) => one.repoId)).not.toContain(CLOSED.id);
    expect(groups.repos.map((group) => group.repo.id)).not.toContain(CLOSED.id);
  });

  it("is in no group of its own", () => {
    expect(groups.repos.map((group) => group.repo.name)).toEqual(["katha"]);
    expect(inSidebarOrder([CLOSED, KATHA]).map((one) => one.name)).toEqual(["katha"]);
    expect(activeRepos([CLOSED, KATHA])).toEqual([KATHA]);
  });

  it("takes its waiting tasks out of Needs you", () => {
    expect(groups.needsYou.map((one) => one.id)).toEqual(["waiting-new"]);
  });

  it("comes back whole when it is opened again", () => {
    const reopened = groupTasks([{ ...CLOSED, status: "active" }, KATHA], TASKS);
    expect(reopened.repos.map((group) => group.repo.name)).toEqual(["katha", "Petal"]);
    expect(reopened.needsYou.map((one) => one.id)).toEqual(["waiting-old", "waiting-new"]);
  });
});

// A reload lists repos with a bare GET /repos, which answers with the open ones, so a repo closed
// before the reload is missing from the list rather than in it as archived.
describe("a repo missing from the list", () => {
  const groups = groupTasks([KATHA], TASKS);

  it("keeps its waiting tasks out of Needs you", () => {
    expect(groups.needsYou.map((one) => one.id)).toEqual(["waiting-new"]);
  });

  it("puts its tasks under no repo, having no repo to put them under", () => {
    expect(groups.repos.map((group) => group.repo.id)).toEqual(["r1"]);
    expect(groups.repos.flatMap((group) => group.tasks.map((one) => one.id))).toEqual([
      "waiting-new",
    ]);
  });

  it("leaves the tasks of a listed, open repo where they were", () => {
    const listed = groupTasks([KATHA, PETAL], TASKS);
    expect(listed.needsYou.map((one) => one.id)).toEqual(["waiting-old", "waiting-new"]);
    expect(listed.repos[1]?.tasks.map((one) => one.id)).toEqual([
      "running",
      "waiting-old",
      "queued",
      "stopped",
      "done",
      "failed",
    ]);
  });
});

describe("History", () => {
  const cleaned = [
    goneTask("done-gone", "r2", "done", 45),
    goneTask("done-gone-older", "r2", "done", 15),
    goneTask("running-gone", "r2", "running", 20),
    goneTask("waiting-gone", "r2", "waiting", 25),
    folderTask("folder-stopped", "r2", "stopped", 35),
    task("done", "r2", "done", 50),
  ];
  const group = groupTasks([PETAL], cleaned).repos[0];

  it("moves a finished task whose worktree is gone out of the list", () => {
    expect(group?.history.map((one) => one.id)).toContain("done-gone");
    expect(group?.tasks.map((one) => one.id)).not.toContain("done-gone");
  });

  it("orders history newest first", () => {
    expect(group?.history.map((one) => one.id)).toEqual(["done-gone", "done-gone-older"]);
  });

  it("leaves a live task in the list until the daemon settles it", () => {
    expect(group?.tasks.map((one) => one.id)).toContain("running-gone");
    expect(inHistory(cleaned[2] as TaskListRow)).toBe(false);
  });

  it("never files a task that is waiting for an answer", () => {
    expect(group?.tasks.map((one) => one.id)).toContain("waiting-gone");
  });

  it("keeps a folder task under its repo: it had no worktree to lose", () => {
    expect(group?.tasks.map((one) => one.id)).toContain("folder-stopped");
  });

  it("leaves a finished task whose worktree is still there where it was", () => {
    expect(group?.tasks.map((one) => one.id)).toContain("done");
  });

  it("leaves History once a resumed task is running again, worktree flag notwithstanding", () => {
    // "done-gone" is in History above. The same task resumed (ADR 031) arrives running, and the
    // page sets the flag from that status; a running task is never a History row either way.
    const resumed = { ...cleaned[0], status: "running" } as TaskListRow;
    expect(inHistory(resumed)).toBe(false);
  });
});
