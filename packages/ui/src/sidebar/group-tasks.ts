import type { RepoListRow, Task, TaskListRow, TaskStatus } from "@agnostic/core";

export type RepoGroup = { repo: RepoListRow; tasks: TaskListRow[]; history: TaskListRow[] };
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
