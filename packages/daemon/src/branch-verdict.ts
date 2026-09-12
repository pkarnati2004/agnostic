import { stat } from "node:fs/promises";
import { ProcessError, run, type Task } from "@agnostic/core";

const GIT_TIMEOUT_MS = 30_000;

/** What the repo says about a task's branch right now. Every field is read in the main checkout. */
export type BranchFacts = {
  /** The last commit the agent itself made: the branch as it stood when the task closed. */
  agentTip: string | null;
  agentLines: number | null;
  branchExists: boolean;
  worktreeExists: boolean;
};

export type Verdict = {
  accepted: boolean;
  reverted: boolean;
  humanChangedLines: number | null;
};

/**
 * The agent's side of the diff. The boundary between the agent's work and the reviewer's is time,
 * not authorship: the agent commits as the user, so the last commit before the task closed is the
 * only honest tip (ADR 022).
 */
export async function readBranchFacts(
  repoPath: string,
  task: Task,
  closedAt: string,
): Promise<BranchFacts> {
  const branch = task.branch;
  const worktreeExists = task.worktreePath !== null && (await isDirectory(task.worktreePath));
  if (branch === null) {
    return { agentTip: null, agentLines: null, branchExists: false, worktreeExists };
  }
  const branchExists = (await revParse(repoPath, `refs/heads/${branch}`)) !== null;
  if (!branchExists) {
    return { agentTip: null, agentLines: null, branchExists, worktreeExists };
  }
  const agentTip = first(
    await git(repoPath, ["rev-list", "-1", `--before=${closedAt}`, `refs/heads/${branch}`]),
  );
  const base = task.baseCommit;
  const agentLines =
    base === null || agentTip === null ? null : await changedLines(repoPath, base, agentTip);
  return { agentTip, agentLines, branchExists, worktreeExists };
}

/**
 * Accepted, reverted, or neither, for a task that ran on a branch agn created. Accepted covers the
 * squash merge as well as the merge commit: after a squash the branch is not an ancestor of
 * anything, but every file it touched reads the same on both sides.
 */
export async function detectVerdict(
  repoPath: string,
  baseRef: string,
  task: Task,
  facts: BranchFacts,
): Promise<Verdict> {
  const branch = task.branch;
  const base = task.baseCommit;
  if (branch === null || base === null) {
    return { accepted: false, reverted: false, humanChangedLines: null };
  }
  const humanChangedLines =
    facts.agentTip === null || !facts.branchExists
      ? null
      : await changedLines(repoPath, facts.agentTip, `refs/heads/${branch}`);
  if (facts.branchExists && (await merged(repoPath, baseRef, base, branch))) {
    return { accepted: true, reverted: false, humanChangedLines };
  }
  // A branch that is gone, or a worktree removed by agn or by hand, is work nobody kept.
  const reverted = !facts.branchExists || !facts.worktreeExists;
  return { accepted: false, reverted, humanChangedLines };
}

async function merged(
  repoPath: string,
  baseRef: string,
  base: string,
  branch: string,
): Promise<boolean> {
  const ref = `refs/heads/${branch}`;
  // A branch with nothing on it has not been accepted, however it compares to the base.
  if (first(await git(repoPath, ["rev-list", "--count", `${base}..${ref}`])) === "0") {
    return false;
  }
  if ((await exitCode(repoPath, ["merge-base", "--is-ancestor", ref, baseRef])) === 0) {
    return true;
  }
  const touched = lines(await git(repoPath, ["diff", "--name-only", `${base}..${ref}`]));
  if (touched.length === 0) {
    return false;
  }
  return (await exitCode(repoPath, ["diff", "--quiet", baseRef, ref, "--", ...touched])) === 0;
}

/** Added plus deleted over a commit range; null when git could not answer. */
async function changedLines(repoPath: string, from: string, to: string): Promise<number | null> {
  const stdout = await git(repoPath, ["diff", "--numstat", `${from}..${to}`]);
  if (stdout === null) {
    return null;
  }
  let total = 0;
  for (const line of lines(stdout)) {
    const [added, deleted] = line.split("\t");
    // A binary file's counts are "-", which is not a number of lines to add up.
    total += count(added) + count(deleted);
  }
  return total;
}

function count(field: string | undefined): number {
  const value = Number(field);
  return Number.isInteger(value) ? value : 0;
}

async function revParse(repoPath: string, ref: string): Promise<string | null> {
  return first(await git(repoPath, ["rev-parse", "--verify", "--quiet", ref]));
}

/** Null is "git could not answer", which every caller here reads as "nothing to record". */
async function git(repoPath: string, args: string[]): Promise<string | null> {
  try {
    return (await run("git", ["-C", repoPath, ...args], { timeoutMs: GIT_TIMEOUT_MS })).stdout;
  } catch (cause) {
    if (cause instanceof ProcessError) {
      return null;
    }
    throw cause;
  }
}

/** For the two questions git answers with its exit code rather than its output. */
async function exitCode(repoPath: string, args: string[]): Promise<number | null> {
  try {
    return (await run("git", ["-C", repoPath, ...args], { timeoutMs: GIT_TIMEOUT_MS })).exitCode;
  } catch (cause) {
    return cause instanceof ProcessError ? cause.exitCode : null;
  }
}

function lines(stdout: string | null): string[] {
  return (stdout ?? "").split("\n").filter((line) => line.trim() !== "");
}

function first(stdout: string | null): string | null {
  return lines(stdout)[0] ?? null;
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
}
