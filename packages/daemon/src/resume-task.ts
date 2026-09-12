import { stat } from "node:fs/promises";
import {
  type Prepared,
  type Profile,
  type Repo,
  type ResumeTaskResponse,
  readRepoConfig,
  type SessionHandle,
  sessionHandle,
  type Task,
  taskLogPath,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { assertFolderFree } from "./folder-guard.js";
import { ensureHooks } from "./hooks-install.js";
import { freshLaunchCommand, resumeLaunchCommand } from "./launch-command.js";
import { resolveRepoId } from "./resolve-id.js";
import { resolveProfile } from "./resolve-profile.js";
import { launchedSession } from "./task-session.js";

const TERMINAL: Task["status"][] = ["done", "failed", "stopped"];

/**
 * ADR 014's three-way tree, and the daemon owns it: a session still running is attached to, a
 * session id the harness gave us is handed back for its own history, and anything else starts the
 * harness again in the same directory with the task context composed into one prompt.
 */
export async function resumeTask(ctx: DaemonContext, task: Task): Promise<ResumeTaskResponse> {
  const live = sessionHandle(task);
  if (live !== null && (await ctx.executor.sessionState(live)) === "running") {
    return { task: running(ctx, task), via: "live", attach: ctx.executor.attach(live) };
  }
  const repo = resolveRepoId(ctx.ledger, task.repoId);
  if (repo.kind === "folder") {
    // Refused before an agent is started, and again with the row below: this one is the message
    // the user gets, that one is what makes two resumes at once safe.
    await ctx.lifecycle.reconcileAll();
    assertFolderFree(ctx.ledger, repo, task.id);
  }
  const profile = await resolveProfile(ctx, repo, { profile: task.profileId });
  const prepared = await prepareIfQueued(ctx, repo, task);
  const cwd = prepared?.cwd ?? task.session?.cwd ?? task.worktreePath ?? repo.path;
  await assertDirectory(task, cwd);
  // Whether the harness picks its conversation up or starts over, it reads its hook config from
  // this directory as it starts.
  await ensureHooks(ctx, profile.harness, cwd);
  const native = resumeLaunchCommand(task, profile, ctx.env);
  const branch = prepared?.branch ?? task.branch;
  const command = native ?? (await freshLaunchCommand(ctx, repo, { ...task, branch }, profile));
  const handle = await ctx.executor.launch({ taskId: task.id, cwd, command });
  return {
    task: await relaunched(ctx, repo, task, profile, { handle, branch, native: native !== null }),
    via: native === null ? "fresh" : "native",
    attach: ctx.executor.attach(handle),
  };
}

/** A live session that the ledger had already written off; nothing about it is re-recorded. */
function running(ctx: DaemonContext, task: Task): Task {
  return TERMINAL.includes(task.status) ? ctx.ledger.tasks.setStatus(task.id, "running") : task;
}

type Relaunch = { handle: SessionHandle; branch: string | null; native: boolean };

/**
 * The guard and the row that leaves the terminal state are one synchronous transaction, so a
 * second resume arriving on the same folder cannot find it free. A session started for a resume
 * that loses that race is stopped again rather than left running with no task.
 */
async function relaunched(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  profile: Profile,
  at: Relaunch,
): Promise<Task> {
  // A native resume continues the same conversation, so its id survives the new tmux session.
  const sessionId = at.native ? (task.session?.sessionId ?? null) : null;
  try {
    return ctx.ledger.transaction(() => {
      assertFolderFree(ctx.ledger, repo, task.id);
      return ctx.ledger.tasks.start(task.id, {
        branch: at.branch,
        session: launchedSession(profile.harness, at.handle, sessionId),
      });
    });
  } catch (cause) {
    await ctx.executor.stop(at.handle).catch((failure: unknown) => {
      ctx.log.error("session not stopped after a refused resume", {
        taskId: task.id,
        message: failure instanceof Error ? failure.message : String(failure),
      });
    });
    throw cause;
  }
}

/** A task the daemon never got to launch has no worktree yet; `prepare` is idempotent. */
async function prepareIfQueued(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
): Promise<Prepared | null> {
  if (task.status !== "queued" || task.origin !== "agn") {
    return null;
  }
  const config = await readRepoConfig(repo.path);
  return await ctx.executor.prepare({
    task,
    repo,
    base: config?.baseBranch ?? null,
    branchPrefix: config?.branchPrefix ?? null,
    setupCommand: config?.setupCommand ?? null,
    logFile: taskLogPath(ctx.paths, task.id),
  });
}

/**
 * ADR 014: a cleaned worktree is not recreated. The branch is still there, so continuing the work
 * is a new task based on this one, which is what the hint says.
 */
async function assertDirectory(task: Task, cwd: string): Promise<void> {
  const there = await stat(cwd).then(
    (stats) => stats.isDirectory(),
    () => false,
  );
  if (there) {
    return;
  }
  if (task.worktreePath !== null) {
    throw new DaemonError(`the worktree for task ${task.id} has been cleaned`, {
      code: "worktree-cleaned",
      hint: `Run \`agn run "<prompt>" --base ${task.id}\` to continue from its branch.`,
    });
  }
  throw new DaemonError(`${cwd} no longer exists`, {
    code: "path-not-found",
    hint: "The directory this task ran in is gone; start a new task in the repo.",
  });
}
