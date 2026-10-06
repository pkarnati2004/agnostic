import type { Event, RepoListRow, Task, TaskListRow, TaskSession } from "@agnostic/core";
import { EMPTY_WORKSPACE, type WorkspaceState, workspaceReducer } from "./workspace-state";

export const REPO: RepoListRow = {
  id: "repo1",
  path: "/tmp/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: "pnpm test",
  pathPresent: true,
};

export const TASK: Task = {
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
  compareId: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T09:00:00.000Z",
};

export const SESSION: TaskSession = {
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
export const ROW: TaskListRow = { ...TASK, worktreePresent: true };

export function loaded(): WorkspaceState {
  return workspaceReducer(EMPTY_WORKSPACE, {
    type: "loaded",
    repos: [REPO],
    tasks: [ROW],
    cursor: 12,
  });
}

export function event<K extends Event["kind"]>(
  id: number,
  kind: K,
  payload: Event<K>["payload"],
): Event {
  return { id, ts: "2026-09-14T10:00:00.000Z", taskId: TASK.id, kind, payload } as Event;
}

export function apply(state: WorkspaceState, ...events: Event[]): WorkspaceState {
  return events.reduce((next, one) => workspaceReducer(next, { type: "event", event: one }), state);
}
