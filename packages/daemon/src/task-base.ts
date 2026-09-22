import { type Repo, readRepoConfig, type Task } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { refCommit, repoBaseRef } from "./base-ref.js";
import { gitLines, gitResult, gitStdout } from "./git-read.js";
import type { TaskDir } from "./task-dir.js";

export type TaskBase = {
  ref: string;
  commit: string | null;
  /** Set when `ref` is another task's branch: the task was started with `--base <task>`. */
  baseTaskId: string | null;
};

/**
 * What a task's branch is judged against. Nothing records `--base <task>`, so a stacked task is
 * recognised from git: a base commit the repo's base ref does not have yet belongs to another
 * task's branch, and that branch is what this work will be reviewed against (ADR 036 Q5). Once
 * the parent is merged its commit is in the base ref again, which is what GitHub does at merge.
 */
export async function resolveTaskBase(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  at: TaskDir,
): Promise<TaskBase> {
  const tip = at.where === "worktree" ? "HEAD" : `refs/heads/${task.branch}`;
  const chosen = await chooseRef(ctx, repo, task, at.dir);
  return { ...chosen, commit: await baseCommit(at.dir, chosen.ref, tip, task.baseCommit) };
}

/** The merge-base moves with the branch, so a base merged in later is not read as the agent's. */
async function baseCommit(
  cwd: string,
  ref: string,
  tip: string,
  recorded: string | null,
): Promise<string | null> {
  const side = (await refCommit(cwd, ref)) ?? ref;
  const found = gitLines(await gitStdout(cwd, ["merge-base", side, tip]))[0] ?? null;
  return found ?? recorded;
}

type ChosenRef = { ref: string; baseTaskId: string | null };

async function chooseRef(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  cwd: string,
  seen: Set<string> = new Set(),
): Promise<ChosenRef> {
  const config = await readRepoConfig(repo.path);
  const parent = parentRow(ctx, task, seen);
  if (parent !== null) {
    // A handoff child continues its parent's stack: the work is one line of review, not two.
    return chooseRef(ctx, repo, parent, cwd, seen.add(task.id));
  }
  const baseRef = await repoBaseRef(repo.path, config);
  const base = task.baseCommit;
  if (base === null || (await inBaseRef(cwd, base, baseRef))) {
    return { ref: baseRef, baseTaskId: null };
  }
  const stacked = await stackedOn(ctx, repo, task, cwd, base);
  return stacked ?? { ref: baseRef, baseTaskId: null };
}

function parentRow(ctx: DaemonContext, task: Task, seen: Set<string>): Task | null {
  const parentId = task.parentTaskId;
  if (parentId === undefined || seen.has(parentId)) {
    return null;
  }
  return ctx.ledger.tasks.get(parentId);
}

/** Only exit 0 is yes: `--is-ancestor` exits 1 for no and 128 for a commit git does not have. */
async function inBaseRef(cwd: string, base: string, baseRef: string): Promise<boolean> {
  const commit = await refCommit(cwd, baseRef);
  if (commit === null) {
    return true;
  }
  const result = await gitResult(cwd, ["merge-base", "--is-ancestor", base, commit]);
  return result?.exitCode === 0;
}

/**
 * The task whose branch holds this task's base commit: the closest one, never a branch whose work
 * has already been accepted - that work reads as part of the base ref now - and never one of this
 * task's own handoff children, which stand on its branch rather than under it.
 */
async function stackedOn(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  cwd: string,
  base: string,
): Promise<ChosenRef | null> {
  const branches = new Set(
    gitLines(await gitStdout(cwd, ["branch", "--format=%(refname:short)", "--contains", base])).map(
      (line) => line.trim(),
    ),
  );
  const candidates = ctx.ledger.tasks
    .list({ repoId: repo.id })
    .filter((row) => row.id !== task.id && row.branch !== null && branches.has(row.branch))
    .filter((row) => ctx.ledger.outcomes.get(row.id)?.accepted !== true)
    .filter((row) => !descendsFrom(ctx, row, task.id));
  return closest(cwd, base, candidates);
}

/** A handoff child continues its parent's branch, so it is never what that parent stands on. */
function descendsFrom(ctx: DaemonContext, row: Task, ancestorId: string): boolean {
  const seen = new Set<string>();
  let current: Task | null = row;
  while (current !== null && !seen.has(current.id)) {
    seen.add(current.id);
    const parentId: string | undefined = current.parentTaskId;
    if (parentId === undefined) {
      return false;
    }
    if (parentId === ancestorId) {
      return true;
    }
    current = ctx.ledger.tasks.get(parentId);
  }
  return false;
}

type Candidate = { ref: string; baseTaskId: string; distance: number; createdAt: string };

/**
 * Fewest commits from the base commit to the branch's tip. Two branches sitting on the same commit
 * tie, and the task started last wins: it is the one the other branches were cut before. The
 * comparison is on `createdAt` rather than on the order the ledger listed the rows in.
 */
async function closest(cwd: string, base: string, candidates: Task[]): Promise<ChosenRef | null> {
  let best: Candidate | null = null;
  for (const row of candidates) {
    const branch = row.branch ?? "";
    const count = gitLines(await gitStdout(cwd, ["rev-list", "--count", `${base}..${branch}`]))[0];
    const distance = Number(count);
    if (!Number.isInteger(distance)) {
      continue;
    }
    const found = { ref: branch, baseTaskId: row.id, distance, createdAt: row.createdAt };
    if (best === null || nearer(found, best)) {
      best = found;
    }
  }
  return best === null ? null : { ref: best.ref, baseTaskId: best.baseTaskId };
}

function nearer(found: Candidate, best: Candidate): boolean {
  if (found.distance !== best.distance) {
    return found.distance < best.distance;
  }
  return found.createdAt > best.createdAt;
}
