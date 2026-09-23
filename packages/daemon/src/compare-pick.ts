import { isDirectory, type PickCompareResponse, type Repo, type Task } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { compareSiblings } from "./compare-read.js";
import { DaemonError } from "./error.js";
import { resolveRepoId } from "./resolve-id.js";

/**
 * Keeps one sibling and clears the rest away: each loser is stopped, its close work finishes, and
 * its worktree goes - with the branch kept, so committed work survives and the ledger reads the
 * loser as reverted. The kept row is not touched at all; `task.status` and `task.cleaned` on the
 * others are what say a pick happened (ADR 036 Q7).
 */
export async function pickCompare(
  ctx: DaemonContext,
  idOrPrefix: string,
  taskId: string,
): Promise<PickCompareResponse> {
  const { compareId, siblings } = compareSiblings(ctx.ledger, idOrPrefix);
  const kept = sibling(siblings, taskId, compareId);
  const repo = resolveRepoId(ctx.ledger, kept.repoId);
  const cleaned: Task[] = [];
  for (const loser of siblings.filter((task) => task.id !== kept.id)) {
    cleaned.push(await release(ctx, repo, loser));
  }
  return { compareId, kept: ctx.ledger.tasks.get(kept.id) ?? kept, cleaned };
}

/**
 * The worktree is removed with force. `agn clean` refuses one holding uncommitted work, but an
 * agent commits rarely and the user has just chosen against this worktree, having read a compare
 * that counted the uncommitted lines too. The branch stays either way.
 */
async function release(ctx: DaemonContext, repo: Repo, task: Task): Promise<Task> {
  const live = await ctx.lifecycle.reconcile(task);
  if (live.status === "running" || live.status === "waiting") {
    await ctx.lifecycle.stop(live);
  }
  // The close work reads the worktree this is about to remove, so it finishes first.
  await ctx.lifecycle.settled(live.id);
  if (live.worktreePath !== null && (await isDirectory(live.worktreePath))) {
    await ctx.executor.clean({ task: live, repo, deleteBranch: false });
    ctx.ledger.tasks.clean(live.id, false);
  }
  return ctx.ledger.tasks.get(live.id) ?? live;
}

/** The id the caller typed, matched among this compare's own tasks and nowhere else. */
function sibling(siblings: Task[], taskId: string, compareId: string): Task {
  const exact = siblings.find((task) => task.id === taskId);
  if (exact !== undefined) {
    return exact;
  }
  const matches = siblings.filter((task) => task.id.startsWith(taskId));
  const first = matches[0];
  if (first === undefined) {
    throw new DaemonError(`${taskId} is not one of compare ${compareId}'s tasks`, {
      code: "compare-not-sibling",
      hint: `Pass one of: ${siblings.map((task) => task.id).join(", ")}`,
    });
  }
  if (matches.length > 1) {
    throw new DaemonError(`"${taskId}" matches ${matches.length} of this compare's tasks`, {
      code: "ambiguous-id",
      hint: `Type more of the id: ${matches.map((task) => task.id).join(", ")}`,
    });
  }
  return first;
}
