import type { RepoListRow } from "@agnostic/core";

/**
 * Where the task will run, in the order the line reads: the machine, the repo, and what agn does
 * with the checkout. A folder repo has no branch to leave, so its task edits the folder in place.
 */
export function contextLine(repo: RepoListRow | null): string[] {
  return [
    "This machine",
    repo?.name ?? "No repo",
    repo?.kind === "folder" ? "In place" : "New worktree",
  ];
}
