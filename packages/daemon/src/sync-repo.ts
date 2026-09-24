import {
  CoreError,
  type Repo,
  readAgText,
  readWorkflows,
  type SyncRequest,
  type SyncResponse,
  type SyncWrite,
  type Workflow,
} from "@agnostic/core";
import {
  applySyncPlan,
  planSync,
  planWorkflowSync,
  readSyncInputs,
  readWorkflowExisting,
} from "@agnostic/sync";
import type { DaemonContext } from "./app.js";
import { resolveWorkflowRoles } from "./workflow-roles.js";

/**
 * Everything one sync writes into `dir`: the two instruction files, and every workflow under
 * `dir`'s own `.ag/workflows/` compiled into Claude Code's agents and commands. All or nothing
 * across both lists, so one file written by hand leaves the whole set as it was.
 */
export async function syncRepo(
  ctx: DaemonContext,
  repo: Repo,
  dir: string,
  req: SyncRequest,
): Promise<SyncResponse> {
  const opts = { force: req.force === true };
  const workflows = await readWorkflows(dir);
  const instructions = await planInstructions(dir, workflows, opts);
  const { resolved, roles } = await resolveWorkflowRoles(ctx, repo, workflows);
  const existing = await readWorkflowExisting(dir, resolved);
  const writes = [...instructions, ...planWorkflowSync({ workflows: resolved, existing }, opts)];
  if (req.dryRun === true) {
    return { writes, roles, applied: false };
  }
  await applySyncPlan(dir, writes);
  return { writes, roles, applied: true };
}

/**
 * A repo can carry workflows and no `instructions.md`; each half of `.ag/` generates on its own.
 * With neither, `readSyncInputs` is the one that says there is nothing to generate from.
 */
async function planInstructions(
  dir: string,
  workflows: Workflow[],
  opts: { force: boolean },
): Promise<SyncWrite[]> {
  if (workflows.length > 0 && (await readAgText(dir, "instructions.md")) === null) {
    return [];
  }
  return planSync(await readSyncInputs(dir), opts);
}

/**
 * What a launch calls for the directory the agent will run in. The source is that directory's own
 * committed `.ag/` (ADR 013: from the commit, never the main checkout's working tree), so a
 * worktree cut from a base older than the last sync still gets the current text and the current
 * roles. A repo without `.ag/` syncs nothing, and a file someone wrote by hand costs a line in the
 * log rather than the whole run.
 */
export async function ensureSynced(ctx: DaemonContext, repo: Repo, cwd: string): Promise<void> {
  try {
    if (!(await hasSyncSource(cwd))) {
      return;
    }
    await syncRepo(ctx, repo, cwd, {});
  } catch (cause) {
    ctx.log.warn("sync skipped", {
      cwd,
      code: cause instanceof CoreError ? cause.code : "unknown",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/** Either half of `.ag/` is reason enough to sync: the instructions, the workflows, or both. */
async function hasSyncSource(dir: string): Promise<boolean> {
  return (
    (await readAgText(dir, "instructions.md")) !== null || (await readWorkflows(dir)).length > 0
  );
}
