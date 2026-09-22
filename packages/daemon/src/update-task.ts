import {
  isDirectory,
  type Repo,
  readRepoConfig,
  sessionHandle,
  type Task,
  type UpdateMode,
  type UpdateTaskResponse,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { resumeTask } from "./resume-task.js";
import { resolveTaskBase } from "./task-base.js";
import { branchUpstream } from "./task-changes.js";
import { taskDir } from "./task-dir.js";
import { updatePrompt } from "./update-prompt.js";

const LIVE: Task["status"][] = ["running", "waiting"];

/**
 * Asks the agent to bring its branch up to date with what the task is judged against (ADR 036 Q6).
 * The mode is read from the branch, not chosen: a branch nobody has pushed is rebased, a published
 * one is merged into, because rewriting a published branch is not agn's to do. A session that is
 * still running is typed into; anything else takes the resume tree with the prompt as its first
 * turn. agn runs no fetch and no git write: the agent does all of it in its own session.
 */
export async function updateTask(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
): Promise<UpdateTaskResponse> {
  const at = await taskDir(ctx, repo, task);
  const branch = task.branch;
  if (branch === null) {
    throw noBranch(task);
  }
  if (task.worktreePath !== null && !(await isDirectory(task.worktreePath))) {
    throw worktreeCleaned(task);
  }
  const base = await resolveTaskBase(ctx, repo, task, at);
  if (base.ref === branch) {
    throw branchIsBase(branch);
  }
  const mode: UpdateMode = (await branchUpstream(at.dir, branch)) === null ? "rebase" : "merge";
  const prompt = updatePrompt({
    baseRef: base.ref,
    branch,
    mode,
    testCommand: (await readRepoConfig(repo.path))?.testCommand ?? null,
  });
  assertReachable(task, prompt);
  // One liveness check and one race window: the resume answers `live` for a session still running,
  // and the prompt is typed into that session rather than launched with a new one.
  const result = await resumeTask(ctx, task, { prompt });
  const handle = sessionHandle(result.task);
  if (result.via === "live" && handle !== null) {
    await ctx.executor.send(handle, prompt);
  }
  return { task: result.task, mode, via: result.via, base: base.ref, prompt };
}

/** A session started outside tmux is agn's to watch, never agn's to type into (ADR 014). */
function assertReachable(task: Task, prompt: string): void {
  if (task.session?.tmuxSession === null && LIVE.includes(task.status)) {
    throw new DaemonError(`task ${task.id} was started outside tmux, so agn cannot type into it`, {
      code: "session-not-attachable",
      hint: `Type the prompt into that terminal yourself: ${prompt}`,
    });
  }
}

function noBranch(task: Task): DaemonError {
  return new DaemonError(`task ${task.id} has no branch, so there is nothing to bring up to date`, {
    code: "repo-not-git",
    hint: "A task agn started has a branch of its own; this one works in the checkout itself.",
  });
}

function worktreeCleaned(task: Task): DaemonError {
  return new DaemonError(
    `the worktree of task ${task.id} was cleaned, so no agent can work in it`,
    {
      code: "worktree-cleaned",
      hint: `Run \`agn resume ${task.id}\` first: it rebuilds the worktree.`,
    },
  );
}

function branchIsBase(branch: string): DaemonError {
  return new DaemonError(`${branch} is what this repo branches from, so it is its own base`, {
    code: "branch-is-base",
    hint: "Move the work onto a branch of its own, then try again.",
  });
}
