import { homedir } from "node:os";
import {
  CoreError,
  type HarnessId,
  type HookInstallResult,
  type Repo,
  type StatusLineInstall,
} from "@agnostic/core";
import {
  type HookInstaller,
  hookCommand,
  hookInstaller,
  type UserScope,
  writeHookScript,
  writeStatusLineScript,
} from "@agnostic/hooks";
import type { DaemonContext } from "./app.js";
import { readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";

/** Every hook config an install touched, and the user-scope status line if the harness has one. */
export type HooksInstall = {
  installs: HookInstallResult[];
  statusLine: StatusLineInstall | null;
};

/**
 * Every directory a hook for this repo belongs in: the checkout, and the worktree of each task
 * that is live right now. A harness reads the hook config of the directory it was started in, and
 * agn starts most tasks in a worktree of its own.
 */
export async function installHooks(
  ctx: DaemonContext,
  repo: Repo,
  harness: HarnessId,
): Promise<HooksInstall> {
  // Before the per-directory installs: each of them chains whatever status line this one kept.
  const statusLine = await syncUserStatusLine(ctx, harness);
  const results: HookInstallResult[] = [];
  for (const directory of [repo.path, ...liveWorktrees(ctx, repo)]) {
    results.push(await install(ctx, harness, directory));
  }
  return { installs: dedupe(results), statusLine };
}

/** Removes agn's entries from the same files, and puts the user's own status line back. */
export async function uninstallHooks(
  ctx: DaemonContext,
  repo: Repo,
  harness: HarnessId,
): Promise<HooksInstall> {
  const results: HookInstallResult[] = [];
  for (const directory of [repo.path, ...liveWorktrees(ctx, repo)]) {
    results.push(await requireInstaller(harness).uninstall(inputFor(ctx, harness, directory)));
  }
  const slot = hookInstaller(harness)?.userStatusLine;
  const removed = await slot?.uninstall(scope(ctx));
  return {
    installs: dedupe(results),
    // Nothing of agn's is left in either file, so this harness reports no limits until a reinstall.
    statusLine: removed === undefined ? null : { ...removed, capture: "none" },
  };
}

/**
 * agn's status-line command in the user's own settings file, where every session of that harness
 * reads it, or out of it when `hooks.claude_statusline` is `repo`. Prints nothing: the user did not
 * ask about that file, and `agn doctor` and `agn hooks install` name the scope.
 */
async function syncUserStatusLine(
  ctx: DaemonContext,
  harness: HarnessId,
): Promise<StatusLineInstall | null> {
  const slot = hookInstaller(harness)?.userStatusLine;
  if (slot === undefined) {
    return null;
  }
  const { hooks } = await readDaemonConfig(ctx.paths);
  await writeStatusLineScript(ctx.paths);
  const user = hooks.claudeStatusline === "user";
  const result = user ? await slot.install(scope(ctx)) : await slot.uninstall(scope(ctx));
  return { ...result, capture: user ? "all-sessions" : "agn-tasks" };
}

/**
 * What a launch calls first, for the directory the session will run in. A harness without an
 * installer is nothing to do, and an install that fails is a task that starts without `waiting`
 * rather than no task at all.
 */
export async function ensureHooks(
  ctx: DaemonContext,
  harness: HarnessId,
  cwd: string,
): Promise<void> {
  if (hookInstaller(harness) === null) {
    return;
  }
  // Its own try: the user's settings file is outside the repo, and a task starts either way.
  try {
    await syncUserStatusLine(ctx, harness);
  } catch (cause) {
    warn(ctx, harness, cause);
  }
  try {
    await install(ctx, harness, cwd);
  } catch (cause) {
    warn(ctx, harness, cause);
  }
}

function warn(ctx: DaemonContext, harness: HarnessId, cause: unknown): void {
  ctx.log.warn("hooks install failed", {
    harness,
    code: cause instanceof CoreError ? cause.code : "unknown",
  });
}

function liveWorktrees(ctx: DaemonContext, repo: Repo): string[] {
  return ctx.ledger.tasks
    .list({ repoId: repo.id, status: ["running", "waiting"] })
    .flatMap((task) => (task.session === undefined ? [] : [task.session.cwd]));
}

/** A per-user installer answers with the same file whatever the directory: that is one install. */
function dedupe(results: HookInstallResult[]): HookInstallResult[] {
  return results.filter(
    (result, at) => results.findIndex((other) => other.file === result.file) === at,
  );
}

async function install(
  ctx: DaemonContext,
  harness: HarnessId,
  repoPath: string,
): Promise<HookInstallResult> {
  await writeHookScript(ctx.paths);
  // Claude Code's install fills a statusLine slot with this script; it exists before it is named.
  await writeStatusLineScript(ctx.paths);
  return requireInstaller(harness).install(inputFor(ctx, harness, repoPath));
}

function inputFor(ctx: DaemonContext, harness: HarnessId, repoPath: string) {
  return {
    repoPath,
    home: ctx.env.HOME ?? homedir(),
    command: hookCommand(ctx.paths, harness),
    paths: ctx.paths,
    env: ctx.env,
  };
}

function scope(ctx: DaemonContext): UserScope {
  return { home: ctx.env.HOME ?? homedir(), paths: ctx.paths, env: ctx.env };
}

function requireInstaller(harness: HarnessId): HookInstaller {
  const installer = hookInstaller(harness);
  if (installer === null) {
    throw new DaemonError(`${harness} has no hook agn can install`, {
      code: "hook-unsupported",
      hint: "Run `agn doctor`: harnesses with basic support report status only while they run.",
    });
  }
  return installer;
}
