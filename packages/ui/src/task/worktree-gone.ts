import type { TaskListRow } from "@agnostic/core";

/**
 * A worktree agn made that is no longer on disk: cleaned, swept, picked away or deleted by hand.
 * False for a folder task and an adopted task, which never had one, so the page keeps offering them
 * what they can still do. A resume rebuilds the worktree and this is false again.
 */
export function worktreeGone(task: Pick<TaskListRow, "worktreePath" | "worktreePresent">): boolean {
  return task.worktreePath !== null && !task.worktreePresent;
}
