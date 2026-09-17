import type { RepoListRow, TaskListRow, TaskStatus } from "@agnostic/core";

export type RepoGroup = { repo: RepoListRow; tasks: TaskListRow[]; history: TaskListRow[] };
export type SidebarGroups = { needsYou: TaskListRow[]; repos: RepoGroup[] };

const OPEN: TaskStatus[] = ["queued", "running", "waiting"];
const FINISHED: TaskStatus[] = ["done", "failed", "stopped"];

/**
 * The sidebar in one pass: the tasks asking for an answer first, oldest question at the top, then
 * every repo with its own tasks. A waiting task is in both, so the repo list stays complete.
 */
export function groupTasks(repos: RepoListRow[], tasks: TaskListRow[]): SidebarGroups {
  const byRepo = new Map<string, TaskListRow[]>();
  for (const task of tasks) {
    byRepo.set(task.repoId, [...(byRepo.get(task.repoId) ?? []), task]);
  }
  const needsYou = tasks
    .filter((task) => task.status === "waiting")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const groups = inSidebarOrder(repos).map((repo) => {
    const own = byRepo.get(repo.id) ?? [];
    return {
      repo,
      tasks: inRepoOrder(own.filter((task) => !inHistory(task))),
      history: newestFirst(own.filter((task) => inHistory(task))),
    };
  });
  return { needsYou, repos: groups };
}

/**
 * Finished, and the worktree it ran in is gone: nothing about this task can be picked up where it
 * was left, so it sits in History rather than at the same weight as a task that can. The daemon
 * checks the worktree per list; the page keeps the flag up to date from the feed.
 */
export function inHistory(task: TaskListRow): boolean {
  return FINISHED.includes(task.status) && task.worktreePath !== null && !task.worktreePresent;
}

/** By name, ignoring case: the order the sidebar reads, so "the first repo" means one thing. */
export function inSidebarOrder(repos: RepoListRow[]): RepoListRow[] {
  return [...repos].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Open tasks before closed ones, each newest first: what is happening now is at the top. */
function inRepoOrder(tasks: TaskListRow[]): TaskListRow[] {
  return [...tasks].sort(
    (a, b) => openFirst(a) - openFirst(b) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** History has no open tasks in it, so the last thing that happened is all that orders it. */
function newestFirst(tasks: TaskListRow[]): TaskListRow[] {
  return [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function openFirst(task: TaskListRow): number {
  return OPEN.includes(task.status) ? 0 : 1;
}
