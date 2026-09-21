import {
  isDirectory,
  type Prepared,
  type Repo,
  readRepoConfig,
  type Task,
  taskLogPath,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { branchExists } from "./branch-verdict.js";
import { DaemonError } from "./error.js";

/** `recreatedFrom` is the branch a cleaned worktree was rebuilt from; the resume says so. */
export type ResumeWorktree = { prepared: Prepared | null; recreatedFrom: string | null };

/**
 * The directory the harness is about to run in, for the two resumes that have none: a task the
 * daemon never got to launch, and one whose worktree was cleaned. A clean keeps the branch and the
 * row, so the worktree goes back at the same path on the same branch (ADR 031) and the resume tree
 * behind this carries on as if it had never been away.
 */
export async function ensureWorktree(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
): Promise<ResumeWorktree> {
  if (task.status === "queued" && task.origin === "agn") {
    // `prepare` is idempotent, and a queued task has no branch yet to name.
    return { prepared: await prepare(ctx, repo, task, null), recreatedFrom: null };
  }
  const path = task.worktreePath;
  if (path === null || (await isDirectory(path))) {
    return { prepared: null, recreatedFrom: null };
  }
  const branch = task.branch;
  if (branch === null) {
    throw worktreeCleaned(task);
  }
  if (!(await branchExists(repo.path, branch))) {
    throw branchGone(task, branch);
  }
  const prepared = await prepare(ctx, repo, task, branch);
  ctx.log.info("worktree recreated", { taskId: task.id, branch });
  return { prepared, recreatedFrom: branch };
}

/**
 * The directory the resume settled on has to be there before an agent is pointed at it. A task
 * with a worktree has already been through `ensureWorktree`; this is the folder workspace whose
 * own directory the user moved or deleted.
 */
export async function assertDirectory(task: Task, cwd: string): Promise<void> {
  if (await isDirectory(cwd)) {
    return;
  }
  if (task.worktreePath !== null) {
    throw worktreeCleaned(task);
  }
  throw new DaemonError(`${cwd} no longer exists`, {
    code: "path-not-found",
    hint: "The directory this task ran in is gone; start a new task in the repo.",
  });
}

/** A recreate re-runs `setup_command`: the worktree's installed dependencies went with it. */
async function prepare(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  branch: string | null,
): Promise<Prepared> {
  const config = await readRepoConfig(repo.path);
  return await ctx.executor.prepare({
    task,
    repo,
    base: config?.baseBranch ?? null,
    branch,
    branchPrefix: config?.branchPrefix ?? null,
    setupCommand: config?.setupCommand ?? null,
    logFile: taskLogPath(ctx.paths, task.id),
  });
}

/** A task with a worktree path but no branch of agn's: the refusal that stood before ADR 031. */
function worktreeCleaned(task: Task): DaemonError {
  return new DaemonError(`the worktree for task ${task.id} has been cleaned`, {
    code: "worktree-cleaned",
    hint: `Run \`agn run "<prompt>" --base ${task.id}\` to continue from its branch.`,
  });
}

/** Both the worktree and the branch are gone, so there is nothing left to rebuild from. */
function branchGone(task: Task, branch: string): DaemonError {
  return new DaemonError(
    `the worktree for task ${task.id} was cleaned and its branch ${branch} no longer exists`,
    {
      code: "worktree-cleaned",
      hint: 'Nothing is left to continue from; run `agn run "<prompt>"` to start over.',
    },
  );
}
