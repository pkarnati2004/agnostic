import type { RepoListRow, Task, TaskListRow, TaskStatus } from "@agnostic/core";
import { worktreeGone } from "../task/worktree-gone";

/** The siblings of one compare, oldest first, which is the order the profiles were given in. */
export type CompareGroup = { compareId: string; title: string; tasks: TaskListRow[] };

/** What the sidebar draws under a repo: one task, or one compare standing for all of its siblings. */
export type SidebarRow =
  | { kind: "task"; task: TaskListRow }
  | { kind: "compare"; group: CompareGroup };

export type RepoGroup = { repo: RepoListRow; rows: SidebarRow[]; history: SidebarRow[] };
export type SidebarGroups = { needsYou: TaskListRow[]; repos: RepoGroup[] };

const OPEN: TaskStatus[] = ["queued", "running", "waiting"];
const FINISHED: TaskStatus[] = ["done", "failed", "stopped"];

/**
 * The sidebar in one pass: the tasks asking for an answer first, oldest question at the top, then
 * every repo with its own tasks. A waiting task is in both, so the repo list stays complete. A task
 * is shown only if the page was given its repo and that repo is active: a closed or removed repo is
 * in neither group and neither are its tasks, and a task whose repo is missing from the list has no
 * section it could sit under, so it appears nowhere.
 */
export function groupTasks(repos: RepoListRow[], tasks: TaskListRow[]): SidebarGroups {
  const open = new Set(activeRepos(repos).map((repo) => repo.id));
  const shown = tasks.filter((task) => open.has(task.repoId));
  const byRepo = new Map<string, TaskListRow[]>();
  for (const task of shown) {
    byRepo.set(task.repoId, [...(byRepo.get(task.repoId) ?? []), task]);
  }
  const needsYou = shown
    .filter((task) => task.status === "waiting")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const groups = inSidebarOrder(repos).map((repo) => {
    const rows = sidebarRows(byRepo.get(repo.id) ?? []);
    return {
      repo,
      rows: inRepoOrder(rows.filter((row) => !rowInHistory(row))),
      history: newestFirst(rows.filter(rowInHistory)),
    };
  });
  return { needsYou, repos: groups };
}

/**
 * A task with a `compareId` joins its group and the group is one row, wherever its siblings would
 * have been. Everything else is a row of its own, as it has always been.
 */
function sidebarRows(tasks: TaskListRow[]): SidebarRow[] {
  const rows: SidebarRow[] = [];
  const compares = new Map<string, TaskListRow[]>();
  for (const task of tasks) {
    const compareId = task.compareId;
    if (compareId === null) {
      rows.push({ kind: "task", task });
    } else {
      compares.set(compareId, [...(compares.get(compareId) ?? []), task]);
    }
  }
  for (const [compareId, siblings] of compares) {
    const oldestFirst = [...siblings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const [first, ...rest] = oldestFirst;
    if (first !== undefined) {
      // Every sibling was started from the one request, so the first one names the group.
      rows.push({
        kind: "compare",
        group: { compareId, title: first.title, tasks: [first, ...rest] },
      });
    }
  }
  return rows;
}

/** A compare is in History once every sibling is: one live agent keeps the group in the list. */
function rowInHistory(row: SidebarRow): boolean {
  return row.kind === "task" ? inHistory(row.task) : row.group.tasks.every(inHistory);
}

/** A group is as new as its newest sibling, and as open as its most open one. */
function rowUpdatedAt(row: SidebarRow): string {
  if (row.kind === "task") {
    return row.task.updatedAt;
  }
  return row.group.tasks.reduce((newest, task) => max(newest, task.updatedAt), "");
}

function max(a: string, b: string): string {
  return a.localeCompare(b) >= 0 ? a : b;
}

/**
 * Finished, and the worktree it ran in is gone: nothing about this task can be picked up where it
 * was left, so it sits in History rather than at the same weight as a task that can. The daemon
 * checks the worktree per list; the page keeps the flag up to date from the feed.
 */
export function inHistory(task: TaskListRow): boolean {
  return FINISHED.includes(task.status) && worktreeGone(task);
}

/**
 * By name, ignoring case, closed repos left out: the order the sidebar reads, so "the first repo"
 * means one thing.
 */
export function inSidebarOrder(repos: RepoListRow[]): RepoListRow[] {
  return activeRepos(repos).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

/**
 * The repos the page shows in its repo sections. A closed one is still in state - the list asks for
 * `?all=1` - so the Closed section can offer it back and a `repo.updated` moves it without a reload.
 * A removed one stays in state too, from the event that removed it, and is drawn nowhere.
 */
export function activeRepos(repos: RepoListRow[]): RepoListRow[] {
  return repos.filter((repo) => repo.status === "active");
}

/**
 * A new task starts in the repo the user is looking at, else in the first one on the left. A tab
 * can outlive its repo's closing, and the new-task dialog lists the open repos only.
 */
export function defaultRepoId(
  state: { repos: RepoListRow[]; tasks: Record<string, Task> },
  activeId: string | null,
): string | null {
  const active = activeId === null ? undefined : state.tasks[activeId];
  const open = inSidebarOrder(state.repos);
  const inFront = open.find((repo) => repo.id === active?.repoId);
  return inFront?.id ?? open[0]?.id ?? null;
}

/** What the Closed section lists, by name: the repos agn keeps the history of and shows nowhere else. */
export function closedRepos(repos: RepoListRow[]): RepoListRow[] {
  return repos
    .filter((repo) => repo.status === "archived")
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/** Open rows before closed ones, each newest first: what is happening now is at the top. */
function inRepoOrder(rows: SidebarRow[]): SidebarRow[] {
  return [...rows].sort(
    (a, b) => openFirst(a) - openFirst(b) || rowUpdatedAt(b).localeCompare(rowUpdatedAt(a)),
  );
}

/** History has no open rows in it, so the last thing that happened is all that orders it. */
function newestFirst(rows: SidebarRow[]): SidebarRow[] {
  return [...rows].sort((a, b) => rowUpdatedAt(b).localeCompare(rowUpdatedAt(a)));
}

function openFirst(row: SidebarRow): number {
  const tasks = row.kind === "task" ? [row.task] : row.group.tasks;
  return tasks.some((task) => OPEN.includes(task.status)) ? 0 : 1;
}
