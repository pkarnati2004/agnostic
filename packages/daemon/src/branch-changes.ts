import { stat } from "node:fs/promises";
import {
  type FileChanges,
  ProcessError,
  type Repo,
  type RepoConfig,
  run,
  type Task,
} from "@agnostic/core";

const GIT_TIMEOUT_MS = 30_000;

/**
 * What the outgoing agent touched, for the handoff note: commits on its branch against the base
 * the repo starts tasks from, plus whatever it left uncommitted. Read-only, and a git command
 * that fails (an empty repo, a base branch since deleted) reports nothing rather than sinking the
 * handoff - the note is context, not a record anything depends on.
 */
export async function fileChanges(
  repo: Repo,
  task: Task,
  config: RepoConfig | null,
): Promise<FileChanges> {
  if (repo.kind === "folder") {
    return { kind: "folder" };
  }
  // An adopted task has no worktree of agn's: it ran in the checkout itself.
  const directory = task.worktreePath ?? repo.path;
  const worktreePath = (await isDirectory(directory)) ? directory : null;
  return {
    kind: "git",
    committed: task.branch === null ? [] : await diffStat(repo.path, task.branch, config),
    uncommitted: worktreePath === null ? [] : await porcelain(worktreePath),
    worktreePath,
  };
}

async function diffStat(
  repoPath: string,
  branch: string,
  config: RepoConfig | null,
): Promise<string[]> {
  const base = config?.baseBranch ?? "HEAD";
  const stdout = await git(repoPath, ["diff", "--stat", "--no-color", `${base}...${branch}`]);
  return lines(stdout);
}

async function porcelain(worktreePath: string): Promise<string[]> {
  return lines(await git(worktreePath, ["status", "--porcelain"]));
}

function lines(stdout: string | null): string[] {
  return (stdout ?? "").split("\n").filter((line) => line.trim() !== "");
}

/** Null is "git could not answer", which every caller here reads as "nothing to report". */
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

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}
