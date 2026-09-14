import { stat } from "node:fs/promises";
import { join } from "node:path";
import { ProcessError, run } from "@agnostic/core";

const GIT_TIMEOUT_MS = 30_000;

/** Every git state where a removal would take work with it that no commit is holding. */
const IN_PROGRESS: { path: string; reason: string }[] = [
  { path: "MERGE_HEAD", reason: "a merge is in progress" },
  { path: "rebase-merge", reason: "a rebase is in progress" },
  { path: "rebase-apply", reason: "a rebase is in progress" },
];

/**
 * Why a worktree must not be removed while nobody is watching, or null when there is none.
 * `git worktree remove --force` discards whatever is not committed, which is the right thing when
 * a person typed `agn clean` and the wrong thing for a sweep that runs on a timer (ADR 022).
 */
export async function unsavedWork(worktreePath: string): Promise<string | null> {
  const status = await git(worktreePath, ["status", "--porcelain"]);
  if (status === null) {
    return "its git status could not be read";
  }
  if (status.trim() !== "") {
    return "it has uncommitted changes";
  }
  const gitDir = (await git(worktreePath, ["rev-parse", "--absolute-git-dir"]))?.trim() ?? null;
  if (gitDir === null) {
    return "its git status could not be read";
  }
  for (const { path, reason } of IN_PROGRESS) {
    if (await exists(join(gitDir, path))) {
      return reason;
    }
  }
  return null;
}

/** Null is "git could not answer", which the caller reads as a reason to leave the worktree. */
async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    return (await run("git", ["-C", cwd, ...args], { timeoutMs: GIT_TIMEOUT_MS })).stdout;
  } catch (cause) {
    if (cause instanceof ProcessError) {
      return null;
    }
    throw cause;
  }
}

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}
