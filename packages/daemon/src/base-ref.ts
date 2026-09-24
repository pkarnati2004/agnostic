import type { RepoConfig } from "@agnostic/core";
import { DaemonError } from "./error.js";
import { gitLines, gitStdout } from "./git-read.js";

/** What a detached checkout is asked about before it gives up, in the order git itself suggests. */
const CONVENTIONAL = ["main", "master"];

/**
 * The branch this repo's work is judged against: `base_branch` in `.ag/agnostic.yaml`, else the
 * branch `origin/HEAD` points at, else the branch the main checkout is on. All read in the
 * checkout, because a task's worktree is on the task's own branch.
 */
export async function repoBaseRef(repoPath: string, config: RepoConfig | null): Promise<string> {
  const configured = config?.baseBranch ?? null;
  if (configured !== null) {
    return configured;
  }
  const origin = await symbolicRef(repoPath, "refs/remotes/origin/HEAD");
  if (origin !== null) {
    return origin.replace(/^origin\//, "");
  }
  const head = await symbolicRef(repoPath, "HEAD");
  if (head !== null) {
    return head;
  }
  for (const branch of CONVENTIONAL) {
    if ((await verify(repoPath, `refs/heads/${branch}`)) !== null) {
      return branch;
    }
  }
  throw new DaemonError(`agn cannot tell what ${repoPath} branches from`, {
    code: "base-unresolved",
    hint: "Set `base_branch` in .ag/agnostic.yaml.",
  });
}

/** The commit a base ref names, locally or on origin; null when neither resolves. */
export async function refCommit(cwd: string, ref: string): Promise<string | null> {
  return (await verify(cwd, ref)) ?? (await verify(cwd, `origin/${ref}`));
}

async function verify(cwd: string, ref: string): Promise<string | null> {
  return first(await gitStdout(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]));
}

async function symbolicRef(cwd: string, ref: string): Promise<string | null> {
  return first(await gitStdout(cwd, ["symbolic-ref", "--quiet", "--short", ref]));
}

function first(stdout: string | null): string | null {
  return gitLines(stdout)[0]?.trim() ?? null;
}
