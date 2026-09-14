import { CoreError, readAgText, type SyncRequest, type SyncResponse } from "@agnostic/core";
import { applySyncPlan, planSync, readSyncInputs } from "@agnostic/sync";
import type { DaemonContext } from "./app.js";

export async function syncRepo(repoPath: string, req: SyncRequest): Promise<SyncResponse> {
  const inputs = await readSyncInputs(repoPath);
  const writes = planSync(inputs, { force: req.force === true });
  if (req.dryRun === true) {
    return { writes, applied: false };
  }
  await applySyncPlan(repoPath, writes);
  return { writes, applied: true };
}

/**
 * What a launch calls for the directory the agent will run in. The source is that directory's own
 * committed `.ag/instructions.md` (ADR 013: from the commit, never the main checkout's working
 * tree), so a worktree cut from a base older than the last sync still gets the current text. A
 * repo without `.ag/` syncs nothing, and a file someone wrote by hand costs a line in the log
 * rather than the whole run.
 */
export async function ensureSynced(ctx: DaemonContext, cwd: string): Promise<void> {
  try {
    if ((await readAgText(cwd, "instructions.md")) === null) {
      return;
    }
    await syncRepo(cwd, {});
  } catch (cause) {
    ctx.log.warn("sync skipped", {
      cwd,
      code: cause instanceof CoreError ? cause.code : "unknown",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
