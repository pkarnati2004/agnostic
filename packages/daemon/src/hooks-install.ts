import { homedir } from "node:os";
import { CoreError, type HarnessId, type HookInstallResult, type Repo } from "@agnostic/core";
import { type HookInstaller, hookCommand, hookInstaller, writeHookScript } from "@agnostic/hooks";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";

/**
 * Every directory a hook for this repo belongs in: the checkout, and the worktree of each task
 * that is live right now. A harness reads the hook config of the directory it was started in, and
 * agn starts most tasks in a worktree of its own.
 */
export async function installHooks(
  ctx: DaemonContext,
  repo: Repo,
  harness: HarnessId,
): Promise<HookInstallResult[]> {
  const live = ctx.ledger.tasks
    .list({ repoId: repo.id, status: ["running", "waiting"] })
    .flatMap((task) => (task.session === undefined ? [] : [task.session.cwd]));
  const results: HookInstallResult[] = [];
  for (const directory of [repo.path, ...live]) {
    results.push(await install(ctx, harness, directory));
  }
  // A per-user installer answers with the same file whatever the directory: that is one install.
  return results.filter(
    (result, at) => results.findIndex((other) => other.file === result.file) === at,
  );
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
  try {
    await install(ctx, harness, cwd);
  } catch (cause) {
    ctx.log.warn("hooks install failed", {
      harness,
      code: cause instanceof CoreError ? cause.code : "unknown",
    });
  }
}

async function install(
  ctx: DaemonContext,
  harness: HarnessId,
  repoPath: string,
): Promise<HookInstallResult> {
  await writeHookScript(ctx.paths);
  return requireInstaller(harness).install({
    repoPath,
    home: ctx.env.HOME ?? homedir(),
    command: hookCommand(ctx.paths, harness),
    paths: ctx.paths,
    env: ctx.env,
  });
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
