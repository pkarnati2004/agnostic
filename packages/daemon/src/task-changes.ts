import {
  type ChangedFile,
  type ChangedFileStatus,
  type ChangesResponse,
  type Repo,
  readRepoConfig,
  type Task,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { refCommit, repoBaseRef } from "./base-ref.js";
import { branchExists } from "./branch-verdict.js";
import { DaemonError } from "./error.js";
import { gitLines, gitResult, gitStdout } from "./git-read.js";
import { resolveTaskBase } from "./task-base.js";
import { taskDir } from "./task-dir.js";

/** The old path of a rename, which the diff route needs as a second pathspec. */
export type ChangedFileEntry = ChangedFile & { from: string | null };

/**
 * What the task's branch changed against its base, read where the task's git lives: the worktree
 * while it is there, the main checkout after a clean. Every command is read-only; agn never
 * fetches, so `behind` is what this machine already knows.
 */
export async function taskChanges(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
): Promise<ChangesResponse> {
  const at = await taskDir(ctx, repo, task);
  if (at.where === "checkout" && !(await hasBranchToRead(repo, task))) {
    return nothingYet(repo, task);
  }
  const tip = at.where === "worktree" ? "HEAD" : `refs/heads/${task.branch}`;
  const worktree = at.where === "worktree";
  const base = await resolveTaskBase(ctx, repo, task, at);
  const refHead = await refCommit(at.dir, base.ref);
  return {
    task,
    base: { ref: base.ref, commit: base.commit },
    ahead: base.commit === null ? 0 : await count(at.dir, `${base.commit}..${tip}`),
    behind: refHead === null ? null : await count(at.dir, `${tip}..${refHead}`),
    uncommitted: worktree ? await uncommitted(at.dir) : 0,
    pushed: (await branchUpstream(at.dir, task.branch ?? "HEAD")) !== null,
    remote: gitLines(await gitStdout(at.dir, ["remote", "get-url", "origin"]))[0] ?? null,
    files: (await changedFiles(at.dir, base.commit, tip, worktree)).map(listed),
  };
}

/** `from` is for the diff route's pathspec; the list on the wire is one row per path. */
function listed(entry: ChangedFileEntry): ChangedFile {
  return {
    path: entry.path,
    status: entry.status,
    additions: entry.additions,
    deletions: entry.deletions,
  };
}

/** Where the branch was published, or null: the branch has never left this machine. */
export async function branchUpstream(cwd: string, branch: string): Promise<string | null> {
  return (
    gitLines(await gitStdout(cwd, ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]))[0] ?? null
  );
}

/**
 * One row per path: `--name-status` says what happened to it and `--numstat` how much, joined by
 * path because neither says both. In a worktree the comparison is the working tree against the
 * base commit, so what the agent has not committed yet is listed too.
 */
export async function changedFiles(
  cwd: string,
  base: string | null,
  tip: "HEAD" | string,
  worktree: boolean,
): Promise<ChangedFileEntry[]> {
  if (base === null) {
    return [];
  }
  const range = worktree ? [base] : [base, tip];
  const names = parseNameStatus(
    await gitStdout(cwd, ["diff", "--name-status", "-z", "-M", ...range]),
  );
  const counts = parseNumstat(await gitStdout(cwd, ["diff", "--numstat", "-z", "-M", ...range]));
  const tracked = names.map((entry) => ({
    path: entry.path,
    status: statusOf(entry.code),
    additions: counts.get(entry.path)?.additions ?? null,
    deletions: counts.get(entry.path)?.deletions ?? null,
    from: entry.from,
  }));
  return worktree ? [...tracked, ...(await untracked(cwd))] : tracked;
}

/**
 * A file git is not tracking has no diff of its own, so each one is counted against /dev/null.
 * git lists a symlinked directory as one entry and never descends into it, so every path here is
 * inside the worktree; the diff route resolves the path it is handed all the same.
 */
async function untracked(cwd: string): Promise<ChangedFileEntry[]> {
  const paths = ((await gitStdout(cwd, ["ls-files", "--others", "--exclude-standard", "-z"])) ?? "")
    .split("\0")
    .filter((path) => path !== "");
  const entries: ChangedFileEntry[] = [];
  for (const path of paths) {
    const result = await gitResult(cwd, ["diff", "--numstat", "--no-index", "/dev/null", path]);
    const [additions, deletions] = (gitLines(result?.stdout ?? null)[0] ?? "").split("\t");
    entries.push({
      path,
      status: "untracked",
      additions: number(additions),
      deletions: number(deletions),
      from: null,
    });
  }
  return entries;
}

/** C is a copy: nothing was there before, so the panel reads it as a new file. */
function statusOf(code: string): ChangedFileStatus {
  const letter = code[0] ?? "M";
  if (letter === "A" || letter === "C") {
    return "added";
  }
  if (letter === "D") {
    return "deleted";
  }
  return letter === "R" ? "renamed" : "modified";
}

type NameStatus = { code: string; path: string; from: string | null };

/** `-z` writes the status and the path as separate records; a rename or a copy writes two paths. */
function parseNameStatus(stdout: string | null): NameStatus[] {
  const fields = (stdout ?? "").split("\0").filter((field) => field !== "");
  const entries: NameStatus[] = [];
  for (let index = 0; index < fields.length; ) {
    const code = fields[index++] ?? "";
    const first = fields[index++] ?? "";
    const renamed = code.startsWith("R") || code.startsWith("C");
    const second = renamed ? (fields[index++] ?? "") : "";
    entries.push(renamed ? { code, path: second, from: first } : { code, path: first, from: null });
  }
  return entries;
}

type Counts = { additions: number | null; deletions: number | null };

/** A rename's record ends with an empty path field, and its two paths follow as their own. */
function parseNumstat(stdout: string | null): Map<string, Counts> {
  const fields = (stdout ?? "").split("\0");
  const counts = new Map<string, Counts>();
  for (let index = 0; index < fields.length; ) {
    const [additions, deletions, path] = (fields[index++] ?? "").split("\t");
    if (path === undefined) {
      continue;
    }
    if (path !== "") {
      counts.set(path, { additions: number(additions), deletions: number(deletions) });
      continue;
    }
    // A rename: its old path follows, then the name the file has now, which is the row's.
    index += 1;
    counts.set(fields[index++] ?? "", {
      additions: number(additions),
      deletions: number(deletions),
    });
  }
  return counts;
}

/** git writes "-" for a binary file, which is not a number of lines. */
function number(field: string | undefined): number | null {
  const value = Number(field);
  return Number.isInteger(value) ? value : null;
}

async function count(cwd: string, range: string): Promise<number> {
  const value = Number(gitLines(await gitStdout(cwd, ["rev-list", "--count", range]))[0]);
  return Number.isInteger(value) ? value : 0;
}

/** Entries, not fields: a rename writes its old path as a record of its own. */
async function uncommitted(cwd: string): Promise<number> {
  const fields = ((await gitStdout(cwd, ["status", "--porcelain", "-z"])) ?? "")
    .split("\0")
    .filter((field) => field !== "");
  let entries = 0;
  for (let index = 0; index < fields.length; index++) {
    const code = (fields[index] ?? "").slice(0, 2);
    entries += 1;
    if (code.includes("R") || code.includes("C")) {
      index += 1;
    }
  }
  return entries;
}

/** A task with no branch has nothing to compare; one whose branch was deleted has lost it. */
export async function hasBranchToRead(repo: Repo, task: Task): Promise<boolean> {
  const branch = task.branch;
  if (branch === null) {
    return false;
  }
  if (await branchExists(repo.path, branch)) {
    return true;
  }
  throw new DaemonError(`the branch ${branch} of task ${task.id} no longer exists`, {
    code: "branch-gone",
    hint: '`agn run "<prompt>"` starts over; the branch was deleted.',
  });
}

/** A queued task: the base it will be judged against is known, the work is not. */
async function nothingYet(repo: Repo, task: Task): Promise<ChangesResponse> {
  const ref = await repoBaseRef(repo.path, await readRepoConfig(repo.path));
  return {
    task,
    base: { ref, commit: task.baseCommit },
    ahead: 0,
    behind: null,
    uncommitted: 0,
    pushed: false,
    remote: gitLines(await gitStdout(repo.path, ["remote", "get-url", "origin"]))[0] ?? null,
    files: [],
  };
}
