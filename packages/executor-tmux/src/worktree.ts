import { realpath, stat } from "node:fs/promises";
import {
  type AgnosticPaths,
  type CleanInput,
  type Prepared,
  type PrepareInput,
  ProcessError,
  run,
  type Task,
  worktreePath,
} from "@agnostic/core";
import { ExecutorError } from "./error.js";
import { runSetupCommand } from "./setup-command.js";

const DEFAULT_PREFIX = "agn/";
const SLUG_MAX_CHARS = 40;

export function branchName(task: Task, prefix: string | null = null): string {
  return `${prefix ?? DEFAULT_PREFIX}${slug(task.title)}-${task.id}`;
}

function slug(title: string): string {
  const slugged = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX_CHARS)
    .replace(/^-+|-+$/g, "");
  return slugged === "" ? "task" : slugged;
}

/**
 * Idempotent: a worktree already registered for this task's branch is reused as it stands. Only a
 * worktree this call creates reports a base commit; a reused one started from a commit the ledger
 * already knows, and guessing it again after the branch has moved would be a lie.
 */
export async function prepareWorktree(
  paths: AgnosticPaths,
  input: PrepareInput,
): Promise<Prepared> {
  const { repo, task } = input;
  if (repo.kind === "folder") {
    return { cwd: repo.path, branch: null, baseCommit: null };
  }
  const path = worktreePath(paths, repo.id, task.id);
  // A resume names the branch the row already ran on; deriving it again would follow a
  // `branch_prefix` that changed since, and branch a second time from HEAD without a word.
  const branch = input.branch ?? branchName(task, input.branchPrefix);
  await git(repo.path, ["worktree", "prune"]);
  const listed = await git(repo.path, ["worktree", "list", "--porcelain"]);
  const registered = parseWorktreeList(listed.stdout);
  // git reports a worktree by its real path, which on macOS is not the /var symlink we built.
  const existing = registered.get(path) ?? registered.get(await realpath(path).catch(() => path));
  if (existing !== undefined) {
    if (existing !== branch) {
      throw occupied(path, `it is a worktree of ${existing ?? "a detached HEAD"}`);
    }
    // The setup command ran when the worktree was created; re-running it would redo the install.
    return { cwd: path, branch, baseCommit: null };
  }
  if (await exists(path)) {
    throw occupied(path, "a directory is already there");
  }
  const { args, base } = await addArgs(repo.path, path, branch, input);
  await git(repo.path, args);
  await runSetupCommand(input, path);
  return { cwd: path, branch, baseCommit: base };
}

/** Removes the worktree and keeps the branch unless asked; the agent's commits outlive the run. */
export async function cleanWorktree(paths: AgnosticPaths, input: CleanInput): Promise<void> {
  const { repo, task } = input;
  if (repo.kind === "folder") {
    return;
  }
  const path = task.worktreePath ?? worktreePath(paths, repo.id, task.id);
  if (await exists(path)) {
    await git(repo.path, ["worktree", "remove", "--force", path]);
  }
  await git(repo.path, ["worktree", "prune"]);
  if (input.deleteBranch) {
    // A branch someone already deleted is not a failure of clean.
    await git(repo.path, ["branch", "-D", task.branch ?? branchName(task)], { allowFailure: true });
  }
}

/** `git worktree list --porcelain` in path order: each block is a worktree and its branch. */
export function parseWorktreeList(stdout: string): Map<string, string | null> {
  const worktrees = new Map<string, string | null>();
  let current: string | null = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = line.slice("worktree ".length).trim();
      worktrees.set(current, null);
    } else if (line.startsWith("branch ") && current !== null) {
      worktrees.set(current, line.slice("branch refs/heads/".length).trim());
    }
  }
  return worktrees;
}

/** A branch kept by an earlier clean is checked out again rather than created a second time. */
async function addArgs(
  repoPath: string,
  path: string,
  branch: string,
  input: PrepareInput,
): Promise<{ args: string[]; base: string | null }> {
  const known = await git(repoPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
    allowFailure: true,
  });
  if (known.exitCode === 0) {
    return { args: ["worktree", "add", path, branch], base: null };
  }
  if (input.branch !== null) {
    // The caller named a branch to continue, so it must be the branch that exists: one deleted
    // since the daemon looked would come back from HEAD under the old name and lose the work.
    throw new ExecutorError(`branch ${branch} no longer exists in ${repoPath}`, {
      code: "worktree-failed",
      hint: 'Nothing is left to continue from; run `agn run "<prompt>"` to start over.',
    });
  }
  const commit = await baseCommit(repoPath, input.base);
  return { args: ["worktree", "add", "-b", branch, path, commit], base: commit };
}

/** Always a commit, never the working tree: what the agent starts from is what the user can read. */
async function baseCommit(repoPath: string, base: string | null): Promise<string> {
  const ref = base ?? "HEAD";
  const resolved = await git(repoPath, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    allowFailure: true,
  });
  const commit = resolved.stdout.trim();
  if (resolved.exitCode !== 0 || commit === "") {
    throw new ExecutorError(
      base === null
        ? `${repoPath} has no commits to branch from`
        : `${repoPath} has no commit for \`${base}\``,
      {
        code: "worktree-failed",
        hint:
          base === null
            ? "Make a first commit in the repo, then start the task again."
            : "Check the --base you passed, or the base_branch in .ag/agnostic.yaml.",
      },
    );
  }
  return commit;
}

function occupied(path: string, why: string): ExecutorError {
  return new ExecutorError(`cannot use ${path} for this task: ${why}`, {
    code: "worktree-occupied",
    hint: `Move or remove ${path}, then start the task again.`,
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    // Nothing agn can stat is nothing in the way: the worktree path is free to use.
    return false;
  }
}

async function git(repoPath: string, args: string[], opts: { allowFailure?: boolean } = {}) {
  try {
    return await run("git", ["-C", repoPath, ...args], { timeoutMs: 30_000 });
  } catch (cause) {
    if (opts.allowFailure && cause instanceof ProcessError && cause.exitCode !== null) {
      return { stdout: "", stderr: cause.stderr, exitCode: cause.exitCode, durationMs: 0 };
    }
    throw new ExecutorError(
      `git ${args.join(" ")} failed in ${repoPath}${cause instanceof ProcessError ? `\n${cause.stderr}` : ""}`,
      {
        code: "worktree-failed",
        hint: "Run the git command by hand in the repo to see what it says.",
        cause,
      },
    );
  }
}
