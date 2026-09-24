import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DiffResponse, Repo, Task } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { gitResult, gitStdout } from "./git-read.js";
import { resolveTaskBase } from "./task-base.js";
import { type ChangedFileEntry, changedFiles, hasBranchToRead } from "./task-changes.js";
import { taskDir } from "./task-dir.js";

/**
 * git's own unified patch for one path. The file list is read again rather than passed in: it is
 * what says whether the path is tracked, and what the old name of a rename was, and the working
 * tree may have moved on since the caller read it.
 */
export async function taskDiff(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  path: string,
): Promise<DiffResponse> {
  const at = await taskDir(ctx, repo, task);
  if (at.where === "checkout" && !(await hasBranchToRead(repo, task))) {
    return { patch: "" };
  }
  await assertInside(at.dir, path);
  const tip = at.where === "worktree" ? "HEAD" : `refs/heads/${task.branch}`;
  const worktree = at.where === "worktree";
  const base = await resolveTaskBase(ctx, repo, task, at);
  const files = await changedFiles(at.dir, base.commit, tip, worktree);
  const entry = files.find((file) => file.path === path);
  if (entry === undefined || base.commit === null) {
    return { patch: "" };
  }
  return { patch: await patch(at.dir, base.commit, tip, worktree, entry) };
}

async function patch(
  cwd: string,
  base: string,
  tip: string,
  worktree: boolean,
  entry: ChangedFileEntry,
): Promise<string> {
  if (entry.status === "untracked") {
    // The patch is the whole file against nothing, and git exits 1 having printed it.
    const result = await gitResult(cwd, [
      "diff",
      "--no-color",
      "--no-index",
      "/dev/null",
      entry.path,
    ]);
    return result?.stdout ?? "";
  }
  const range = worktree ? [base] : [base, tip];
  const paths = entry.from === null ? [entry.path] : [entry.path, entry.from];
  return (await gitStdout(cwd, ["diff", "--no-color", "-M", ...range, "--", ...paths])) ?? "";
}

/**
 * The path came from a request, so it is checked against the directory it will be read in - and
 * resolved first, because a symlink to somewhere else reads as a path inside the repo while
 * `git diff --no-index` prints the file it really points at.
 */
async function assertInside(dir: string, path: string): Promise<void> {
  const root = await realpath(dir).catch(() => resolve(dir));
  const inside = relative(root, await realTarget(resolve(dir, path)));
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new DaemonError(`${path} is not inside ${dir}`, {
      code: "path-outside-repo",
      hint: "Pass a path as the changes list prints it, relative to the repo root.",
    });
  }
}

/**
 * Where a path really is: the deleted file a diff asks for does not exist, so the nearest parent
 * that does is resolved instead and the missing tail put back on it.
 */
async function realTarget(target: string): Promise<string> {
  let current = target;
  for (;;) {
    const real = await realpath(current).catch(() => null);
    if (real !== null) {
      return current === target ? real : join(real, relative(current, target));
    }
    const parent = dirname(current);
    if (parent === current) {
      return target;
    }
    current = parent;
  }
}
