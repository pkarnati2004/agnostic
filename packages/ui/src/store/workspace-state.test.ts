import type { Event, Repo, RepoListRow, Task, TaskListRow, TaskSession } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import {
  EMPTY_WORKSPACE,
  REFETCH_KINDS,
  type WorkspaceState,
  workspaceReducer,
} from "./workspace-state";

const REPO: RepoListRow = {
  id: "repo1",
  path: "/tmp/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: "pnpm test",
  pathPresent: true,
};

const TASK: Task = {
  id: "task1",
  repoId: "repo1",
  title: "Fix the parser",
  prompt: "fix the parser",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/tmp/petal-wt",
  branch: "agn/fix-the-parser",
  status: "running",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T09:00:00.000Z",
};

const SESSION: TaskSession = {
  harness: "claude-code",
  sessionId: null,
  tmuxSession: "agn-task1",
  tmuxSocket: "agn",
  launchId: "launch1",
  pid: null,
  cwd: "/tmp/petal-wt",
  lastSeenAt: "2026-09-14T09:05:00.000Z",
};

// The list route sends rows, not bare tasks: this one's worktree was on disk when it was read.
const ROW: TaskListRow = { ...TASK, worktreePresent: true };

function loaded(): WorkspaceState {
  return workspaceReducer(EMPTY_WORKSPACE, {
    type: "loaded",
    repos: [REPO],
    tasks: [ROW],
    cursor: 12,
  });
}

function event<K extends Event["kind"]>(id: number, kind: K, payload: Event<K>["payload"]): Event {
  return { id, ts: "2026-09-14T10:00:00.000Z", taskId: TASK.id, kind, payload } as Event;
}

function apply(state: WorkspaceState, ...events: Event[]): WorkspaceState {
  return events.reduce((next, one) => workspaceReducer(next, { type: "event", event: one }), state);
}

describe("workspaceReducer", () => {
  it("loads repos and tasks with the cursor they were read at", () => {
    const state = loaded();
    expect(state.loaded).toBe(true);
    expect(state.repos).toEqual([REPO]);
    expect(state.tasks).toEqual({ task1: ROW });
    expect(state.cursor).toBe(12);
  });

  it("replaces a task row with the one an action carries", () => {
    const state = workspaceReducer(loaded(), { type: "task", task: { ...TASK, status: "done" } });
    expect(state.tasks.task1?.status).toBe("done");
  });

  it("moves a task to the status the event carries", () => {
    const state = apply(loaded(), event(13, "task.status", { from: "running", to: "waiting" }));
    expect(state.tasks.task1?.status).toBe("waiting");
    expect(state.tasks.task1?.updatedAt).toBe("2026-09-14T10:00:00.000Z");
    expect(state.cursor).toBe(13);
  });

  it("applies the same status event twice to the same state", () => {
    const once = apply(loaded(), event(13, "task.status", { from: "running", to: "waiting" }));
    const twice = apply(once, event(13, "task.status", { from: "running", to: "waiting" }));
    expect(twice).toEqual(once);
  });

  it("leaves a status event for a task it has never seen alone", () => {
    const stray: Event = {
      ...event(14, "task.status", { from: "running", to: "done" }),
      taskId: "task9",
    };
    const state = apply(loaded(), stray);
    expect(state.tasks).toEqual({ task1: ROW });
    expect(state.cursor).toBe(14);
  });

  it("adds a created task", () => {
    const fresh: Task = { ...TASK, id: "task2", status: "queued" };
    const state = apply(loaded(), event(15, "task.created", { task: fresh }));
    expect(state.tasks.task2).toEqual({ ...fresh, worktreePresent: true });
  });

  it("records a captured session", () => {
    const state = apply(loaded(), event(16, "session.captured", { session: SESSION }));
    expect(state.tasks.task1?.session).toEqual(SESSION);
  });

  it("adds a registered repo and keeps the test command of one it already had", () => {
    const second: Repo = {
      id: "repo2",
      path: "/tmp/katha",
      kind: "git",
      name: "katha",
      addedAt: "2026-09-02T00:00:00.000Z",
      status: "active",
    };
    const renamed: Repo = { ...REPO, name: "petal-2" };
    const state = apply(
      loaded(),
      event(17, "repo.registered", { repo: second }),
      event(18, "repo.updated", { repo: renamed }),
    );
    expect(state.repos.map((repo) => repo.name)).toEqual(["petal-2", "katha"]);
    expect(state.repos[0]?.testCommand).toBe("pnpm test");
    expect(state.repos[1]?.testCommand).toBeNull();
  });

  it("replaces the row when a repo is closed, and again when it is opened", () => {
    const closed = apply(
      loaded(),
      event(19, "repo.updated", { repo: { ...REPO, status: "archived" } }),
    );
    expect(closed.repos).toEqual([{ ...REPO, status: "archived" }]);
    const opened = apply(
      closed,
      event(20, "repo.updated", { repo: { ...REPO, status: "active" } }),
    );
    expect(opened.repos).toEqual([REPO]);
  });

  it("keeps a removed repo in state, with the status the event carried", () => {
    // The row stays so a tab on its task can still name it; nothing in the sidebar draws it.
    const state = apply(
      loaded(),
      event(19, "repo.updated", { repo: { ...REPO, status: "removed" } }),
    );
    expect(state.repos).toEqual([{ ...REPO, status: "removed" }]);
  });

  it("keeps what the list knew about the folder, and assumes a new repo's folder is there", () => {
    const gone = workspaceReducer(EMPTY_WORKSPACE, {
      type: "loaded",
      repos: [{ ...REPO, pathPresent: false }],
      tasks: [],
      cursor: 12,
    });
    const closed = apply(
      gone,
      event(19, "repo.updated", { repo: { ...REPO, status: "archived" } }),
    );
    expect(closed.repos[0]).toMatchObject({ status: "archived", pathPresent: false });

    const added: Repo = { ...REPO, id: "repo2", path: "/tmp/katha", name: "katha" };
    const both = apply(closed, event(20, "repo.registered", { repo: added }));
    expect(both.repos[1]).toMatchObject({ id: "repo2", pathPresent: true });
  });

  it("advances the cursor for a kind it draws nothing from", () => {
    const state = apply(
      loaded(),
      event(20, "plan.changed", {
        harness: "claude-code",
        from: null,
        to: "max20",
        source: "detected",
      }),
    );
    expect(state).toEqual({ ...loaded(), cursor: 20 });
  });

  it("counts a task's usage events against the task and the plans", () => {
    const recorded = event(19, "usage.recorded", {
      tokens: 10,
      costUsd: 0.1,
      source: "transcript",
    });
    const state = apply(loaded(), recorded, { ...recorded, id: 21 });
    expect(state.usageStamp).toEqual({ plans: 2, byTask: { [TASK.id]: 2 } });
    expect(state.cursor).toBe(21);
  });

  it("counts a usage event with no task against the plans alone", () => {
    const recorded = event(19, "usage.recorded", {
      tokens: 10,
      costUsd: null,
      source: "transcript",
    });
    const state = apply(loaded(), { ...recorded, taskId: undefined });
    expect(state.usageStamp).toEqual({ plans: 1, byTask: {} });
  });

  it("resets the usage counters when a new snapshot lands", () => {
    const recorded = event(19, "usage.recorded", {
      tokens: 10,
      costUsd: null,
      source: "transcript",
    });
    const state = workspaceReducer(apply(loaded(), recorded), {
      type: "loaded",
      repos: [REPO],
      tasks: [ROW],
      cursor: 30,
    });
    expect(state.usageStamp).toEqual({ plans: 0, byTask: {} });
  });

  it("refetches the rows an event does not carry", () => {
    expect([...REFETCH_KINDS].sort()).toEqual(["task.adopted", "task.cleaned", "task.handoff"]);
  });
});

describe("worktreePresent", () => {
  const done = (state: WorkspaceState) =>
    workspaceReducer(state, { type: "task", task: { ...TASK, status: "done" } });

  it("keeps what it knows when a row arrives from a response", () => {
    const cleaned = apply(loaded(), event(13, "task.cleaned", { deletedBranch: false }));
    expect(cleaned.tasks.task1?.worktreePresent).toBe(false);
    expect(done(cleaned).tasks.task1?.worktreePresent).toBe(false);
  });

  it("sets it from a row that arrives running, which is the resume answer", () => {
    const cleaned = apply(loaded(), event(13, "task.cleaned", { deletedBranch: false }));
    const resumed = workspaceReducer(cleaned, {
      type: "task",
      task: { ...TASK, status: "running" },
    });
    expect(resumed.tasks.task1?.worktreePresent).toBe(true);
  });

  it("follows the path for a task it has never seen", () => {
    const folder: Task = { ...TASK, id: "task3", worktreePath: null, status: "done" };
    const state = workspaceReducer(loaded(), { type: "task", task: folder });
    expect(state.tasks.task3?.worktreePresent).toBe(false);
  });

  it("sets it again when the task goes back to running", () => {
    const cleaned = apply(loaded(), event(13, "task.cleaned", { deletedBranch: false }));
    const live = apply(cleaned, event(14, "task.status", { from: "done", to: "running" }));
    expect(live.tasks.task1?.worktreePresent).toBe(true);
  });

  it("leaves a finished status alone", () => {
    const cleaned = apply(loaded(), event(13, "task.cleaned", { deletedBranch: false }));
    const stopped = apply(cleaned, event(14, "task.status", { from: "running", to: "stopped" }));
    expect(stopped.tasks.task1?.worktreePresent).toBe(false);
  });

  it("follows the path of a created task", () => {
    const folder: Task = { ...TASK, id: "task4", worktreePath: null, status: "queued" };
    const state = apply(loaded(), event(15, "task.created", { task: folder }));
    expect(state.tasks.task4?.worktreePresent).toBe(false);
  });
});
