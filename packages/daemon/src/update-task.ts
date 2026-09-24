import {
  isDirectory,
  type Repo,
  readRepoConfig,
  type Task,
  type UpdateMode,
  type UpdateTaskResponse,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { askAgent } from "./ask-agent.js";
import { DaemonError } from "./error.js";
import { resolveTaskBase } from "./task-base.js";
import { branchUpstream } from "./task-changes.js";
import { taskDir } from "./task-dir.js";
import { updatePrompt } from "./update-prompt.js";

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
  const asked = await askAgent(ctx, task, { heading: "Bring up to date", body: prompt });
  return { task: asked.task, mode, via: asked.via, base: base.ref, prompt };
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
