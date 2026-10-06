import {
  type DeleteTaskResponse,
  isDirectory,
  type Repo,
  type Task,
  type TaskStatus,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { resolveRepoId } from "./resolve-id.js";

// A queued row is inside the launch that made it (ADR 014), so it is as busy as a running one.
const ACTIVE: TaskStatus[] = ["queued", "running", "waiting"];

/**
 * ADR 037: the worktree and every agn record of the task go; the branch, the task's note in the
 * repo and the tokens stay. The worktree is removed first, so a removal that fails leaves the
 * rows for the user to try again on.
 */
export async function deleteTask(ctx: DaemonContext, task: Task): Promise<DeleteTaskResponse> {
  if (ACTIVE.includes(task.status)) {
    throw new DaemonError(`task ${task.id} is still ${task.status}`, {
      code: "task-active",
      hint: `Run \`agn stop ${task.id}\` first.`,
    });
  }
  // The close work reads the worktree and writes the outcome row this is about to delete.
  await ctx.lifecycle.settled(task.id);
  const repo = resolveRepoId(ctx.ledger, task.repoId);
  const removedWorktree = await removeWorktree(ctx, repo, task);
  ctx.ledger.tasks.delete(task.id, { removedWorktree });
  return { deleted: true, taskId: task.id, branch: task.branch, removedWorktree };
}

/** Never `ledger.tasks.clean`: the row is about to go, and a `task.cleaned` event would go with it. */
async function removeWorktree(ctx: DaemonContext, repo: Repo, task: Task): Promise<boolean> {
  if (task.worktreePath === null || !(await isDirectory(task.worktreePath))) {
    return false;
  }
  try {
    await ctx.executor.clean({ task, repo, deleteBranch: false });
  } catch (cause) {
    throw new DaemonError(`the worktree for task ${task.id} was not removed: ${message(cause)}`, {
      code: "worktree-remove-failed",
      hint: `Remove ${task.worktreePath} by hand, then run \`agn task delete ${task.id}\` again.`,
      cause,
    });
  }
  return true;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
