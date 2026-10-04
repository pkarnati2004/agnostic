import type { ChangedFile, TaskListRow } from "@agnostic/core";
import { worktreeGone } from "./worktree-gone";

/** What the delete dialog says: what goes, what stays, and what is lost with the worktree. */
export type DeleteCopy = {
  title: string;
  body: string;
  /** Null when the worktree holds nothing uncommitted, or when the read of it failed. */
  warning: string | null;
  /** The first two paths, which is as many as the line has room for. */
  files: string[];
  /** How many uncommitted paths the two above leave out. */
  more: number;
};

/** How many of the uncommitted paths the warning line names. */
const NAMED = 2;

export function deleteCopy(
  task: TaskListRow,
  repoName: string | null,
  uncommitted: ChangedFile[] | null,
): DeleteCopy {
  const paths = (uncommitted ?? []).map((file) => file.path);
  return {
    title: `Delete ${task.title}?`,
    body: [removes(task), branchSentence(task.branch, repoName), TOKENS]
      .filter((sentence) => sentence !== null)
      .join(" "),
    warning: paths.length === 0 ? null : lost(paths.length),
    files: paths.slice(0, NAMED),
    more: Math.max(paths.length - NAMED, 0),
  };
}

/** The daemon answers one request, so the page cannot tell its two phases apart; it names the
 * longer one when there is a worktree to remove. */
export function busyLabel(
  task: Pick<TaskListRow, "worktreePresent">,
): "Removing the worktree…" | "Deleting…" {
  return task.worktreePresent ? "Removing the worktree…" : "Deleting…";
}

const TOKENS = "The tokens this task used stay in the usage totals.";

/** A worktree that is already gone is not something the delete takes away. */
function removes(task: TaskListRow): string {
  const records = "the task, its events and its outcome.";
  if (worktreeGone(task) || task.worktreePath === null) {
    return `This removes every agn record for the task: ${records}`;
  }
  return `This removes the task's worktree and every agn record for it: ${records}`;
}

function branchSentence(branch: string | null, repoName: string | null): string | null {
  if (branch === null) {
    return null;
  }
  return repoName === null
    ? `The branch \`${branch}\` stays.`
    : `The branch \`${branch}\` stays in ${repoName}.`;
}

function lost(count: number): string {
  const files = count === 1 ? "1 uncommitted file" : `${count} uncommitted files`;
  return `${files} in the worktree will be lost.`;
}
