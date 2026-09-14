import type { RepoListRow, Task, TaskStatus } from "@agnostic/core";

export type RepoGroup = { repo: RepoListRow; tasks: Task[] };
export type SidebarGroups = { needsYou: Task[]; repos: RepoGroup[] };

const OPEN: TaskStatus[] = ["queued", "running", "waiting"];

/**
 * The sidebar in one pass: the tasks asking for an answer first, oldest question at the top, then
 * every repo with its own tasks. A waiting task is in both, so the repo list stays complete.
 */
export function groupTasks(repos: RepoListRow[], tasks: Task[]): SidebarGroups {
  const byRepo = new Map<string, Task[]>();
  for (const task of tasks) {
    byRepo.set(task.repoId, [...(byRepo.get(task.repoId) ?? []), task]);
  }
  const needsYou = tasks
    .filter((task) => task.status === "waiting")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const groups = [...repos]
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .map((repo) => ({ repo, tasks: inRepoOrder(byRepo.get(repo.id) ?? []) }));
  return { needsYou, repos: groups };
}

/** Open tasks before closed ones, each newest first: what is happening now is at the top. */
function inRepoOrder(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => openFirst(a) - openFirst(b) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

function openFirst(task: Task): number {
  return OPEN.includes(task.status) ? 0 : 1;
}
