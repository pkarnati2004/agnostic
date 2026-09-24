import {
  type AskCommitResponse,
  COMMIT_PROMPT_FILE,
  commitPrompt,
  isDirectory,
  type Repo,
  readAgText,
  type Task,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { askAgent } from "./ask-agent.js";
import { DaemonError } from "./error.js";

/**
 * Asks the agent to commit the work it has done (ADR 036). The prompt is the repo's own
 * `.ag/prompts/commit.md` when it has one and agn's default otherwise, and it is read from the
 * repo rather than the worktree, as `decisions.md` is. agn runs no git command here: a commit that
 * lands is one the agent made in its own session.
 */
export async function askCommit(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
): Promise<AskCommitResponse> {
  const branch = task.branch;
  if (branch === null) {
    throw noBranch(task);
  }
  if (task.worktreePath !== null && !(await isDirectory(task.worktreePath))) {
    throw worktreeCleaned(task);
  }
  const prompt = commitPrompt({
    branch,
    file: await readAgText(repo.path, COMMIT_PROMPT_FILE),
  });
  const asked = await askAgent(ctx, task, { heading: "Commit", body: prompt });
  return { task: asked.task, via: asked.via, prompt };
}

function noBranch(task: Task): DaemonError {
  return new DaemonError(`task ${task.id} has no branch, so there is nothing to commit on`, {
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
