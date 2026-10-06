import {
  errorMessage,
  isClosed,
  type LaunchCommand,
  type Profile,
  type Repo,
  type ResumeTaskResponse,
  type SessionHandle,
  sessionHandle,
  type Task,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { assertFolderFree } from "./folder-guard.js";
import { ensureHooks } from "./hooks-install.js";
import { type ExtraSection, freshLaunchCommand, resumeLaunchCommand } from "./launch-command.js";
import { assertRepoUsable } from "./repo-guard.js";
import { resolveRepoId } from "./resolve-id.js";
import { resolveProfile } from "./resolve-profile.js";
import { assertDirectory, ensureWorktree } from "./resume-worktree.js";
import { sessionEvidence } from "./session-evidence.js";
import { ensureSynced } from "./sync-repo.js";
import { launchedSession } from "./task-session.js";

/**
 * ADR 014's three-way tree, and the daemon owns it: a session still running is attached to, a
 * session id the harness gave us is handed back for its own history, and anything else starts the
 * harness again in the same directory with the task context composed into one prompt. A worktree
 * that was cleaned is rebuilt from its branch before any of that, so a resume after a clean takes
 * the same three ways as a resume after a stop (ADR 031).
 *
 * `opts.turn` is a turn to open the session with: the native route pastes its body once the harness
 * has restored its history, and a fresh launch carries it as one more section of the context
 * prompt, under its own heading. A live session takes no turn here - the caller types into the
 * session it was given.
 */
export async function resumeTask(
  ctx: DaemonContext,
  task: Task,
  opts: { turn?: ExtraSection } = {},
): Promise<ResumeTaskResponse> {
  const live = sessionHandle(task);
  if (live !== null && (await ctx.executor.sessionState(live)) === "running") {
    return {
      task: running(ctx, task),
      via: "live",
      attach: ctx.executor.attach(live),
      recreatedFrom: null,
    };
  }
  // A stop answers as soon as the task is stopped, and the close work behind it runs the repo's
  // test command in this worktree (ADR 021); the harness must not be started back up under it.
  await ctx.lifecycle.settled(task.id);
  const repo = resolveRepoId(ctx.ledger, task.repoId);
  await assertRepoUsable(repo);
  if (repo.kind === "folder") {
    // Refused before an agent is started, and again with the row below: this one is the message
    // the user gets, that one is what makes two resumes at once safe.
    await ctx.lifecycle.reconcileAll();
    assertFolderFree(ctx.ledger, repo, task.id);
  }
  const profile = await resolveProfile(ctx, repo, { profile: task.profileId });
  const { prepared, recreatedFrom } = await ensureWorktree(ctx, repo, task);
  const cwd = prepared?.cwd ?? task.session?.cwd ?? task.worktreePath ?? repo.path;
  await assertDirectory(task, cwd);
  // Whether the harness picks its conversation up or starts over, it reads its instructions and
  // its hook config from this directory as it starts. A live session never gets here.
  await ensureSynced(ctx, repo, cwd);
  await ensureHooks(ctx, profile.harness, cwd);
  const native = await nativeResume(ctx, task, profile);
  const branch = prepared?.branch ?? task.branch;
  const turn = opts.turn ?? null;
  const command =
    native === null
      ? await freshLaunchCommand(ctx, repo, { ...task, branch }, profile, turn)
      : { ...native, promptAfterStart: turn?.body ?? null };
  const handle = await ctx.executor.launch({ taskId: task.id, cwd, command });
  if (native !== null && handle.launchId !== null) {
    // The belt behind the check above: a harness that rejects the id exits without a hook.
    ctx.resumeWatch.launched(task.id, handle.launchId);
  }
  return {
    task: await relaunched(ctx, repo, task, profile, {
      handle,
      branch,
      baseCommit: prepared?.baseCommit ?? task.baseCommit,
      native: native !== null,
    }),
    via: native === null ? "fresh" : "native",
    attach: ctx.executor.attach(handle),
    recreatedFrom,
  };
}

/**
 * ADR 008's native route, taken only where the harness still has the conversation. The file
 * `--resume` reads is named for the session id, so an id no transcript carries would put the
 * harness's own error in the pane and kill the task; that id starts fresh instead. A tree agn
 * could not read is not evidence of absence, and still resumes natively.
 */
async function nativeResume(
  ctx: DaemonContext,
  task: Task,
  profile: Profile,
): Promise<LaunchCommand | null> {
  const sessionId = task.session?.sessionId ?? null;
  if (sessionId === null) {
    return null;
  }
  const evidence = await sessionEvidence({ home: ctx.home, harness: profile.harness, sessionId });
  if (evidence === "none") {
    ctx.log.info("no transcript for the recorded session; resuming fresh", {
      taskId: task.id,
      harness: profile.harness,
    });
    return null;
  }
  return resumeLaunchCommand(task, profile, ctx.env);
}

/** A live session that the ledger had already written off; nothing about it is re-recorded. */
function running(ctx: DaemonContext, task: Task): Task {
  return isClosed(task.status) ? ctx.ledger.tasks.setStatus(task.id, "running") : task;
}

type Relaunch = {
  handle: SessionHandle;
  branch: string | null;
  /** Only a resume that created the worktree has a base to report; otherwise the row keeps its own. */
  baseCommit: string | null;
  native: boolean;
};

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
        baseCommit: at.baseCommit,
        session: launchedSession(profile.harness, at.handle, sessionId),
      });
    });
  } catch (cause) {
    await ctx.executor.stop(at.handle).catch((failure: unknown) => {
      ctx.log.error("session not stopped after a refused resume", {
        taskId: task.id,
        message: errorMessage(failure),
      });
    });
    throw cause;
  }
}
