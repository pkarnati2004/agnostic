import { isDirectory, type Repo, type Task } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { gitLines, gitStdout } from "./git-read.js";
import { resolveRepoId } from "./resolve-id.js";

/** `where: "checkout"` means the worktree is gone, so only committed changes can be read. */
export type TaskDir = { dir: string; where: "worktree" | "checkout" };

/**
 * Which git directory answers for a task, in ADR 023's order: the worktree agn made while it is
 * on disk, then the directory an adopted session runs in, then the repo itself.
 */
export async function taskDir(ctx: DaemonContext, repo: Repo, task: Task): Promise<TaskDir> {
  if (repo.kind === "folder") {
    throw new DaemonError(`${repo.name} is a folder workspace, so it has no changes to read`, {
      code: "repo-not-git",
      hint: `Run \`git init\` in ${repo.path}, or \`agn add ${repo.path} --git-init\`.`,
    });
  }
  if (task.worktreePath !== null && (await isDirectory(task.worktreePath))) {
    return { dir: task.worktreePath, where: "worktree" };
  }
  const adopted = await adoptedDir(task);
  if (adopted !== null) {
    return { dir: adopted, where: "worktree" };
  }
  return { dir: resolveRepoId(ctx.ledger, task.repoId).path, where: "checkout" };
}

/** The root of the checkout an adopted session runs in, so its paths read from the repo root. */
async function adoptedDir(task: Task): Promise<string | null> {
  const cwd = task.session?.cwd ?? null;
  if (cwd === null || !(await isDirectory(cwd))) {
    return null;
  }
  return gitLines(await gitStdout(cwd, ["rev-parse", "--show-toplevel"]))[0]?.trim() ?? null;
}
