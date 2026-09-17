import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RemoveRepoResponse, Repo } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { refuseWhileBusy } from "./repo-busy.js";

/**
 * ADR 034: hides the repo for good and deletes the worktree directories agn made for its tasks.
 * Every row stays - the outcomes are what the recommender learns from - and the user's own repo
 * folder is never touched. Idempotent: removing a removed repo answers with no worktrees deleted.
 * Never git: the repo may be gone, and `git worktree prune` runs before the next prepare anyway.
 */
export async function removeRepo(ctx: DaemonContext, repo: Repo): Promise<RemoveRepoResponse> {
  // A session that died without a hook must not hold a repo open, so reconcile before looking.
  await ctx.lifecycle.reconcileAll();
  const removed = ctx.ledger.transaction(() => {
    refuseWhileBusy(ctx, repo);
    return ctx.ledger.repos.update(repo.id, { status: "removed" });
  });
  const root = join(ctx.paths.worktrees, repo.id);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  await rm(root, { recursive: true, force: true });
  return { repo: removed, worktreesRemoved: entries.filter((entry) => entry.isDirectory()).length };
}
