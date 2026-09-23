import {
  type ChangesResponse,
  type CompareChanges,
  type CompareResponse,
  type CompareTaskRow,
  isDirectory,
  type Repo,
  type Task,
} from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import { resolveCompareId, resolveRepoId } from "./resolve-id.js";
import { taskChanges } from "./task-changes.js";
import { billingForProfile } from "./usage-scan.js";
import { refreshVerdict } from "./verdict-sweep.js";

/** The git refusals that mean "there is nothing honest to count", not "this request was wrong". */
const NO_COUNT = ["branch-gone", "base-unresolved", "repo-not-git"];

/**
 * The siblings of one compare side by side: what each has spent, what each has changed, and which
 * one a pick kept. It does not wait for `lifecycle.settled`: a sibling stopped a moment ago may
 * still be running the repo's test command, and the read has to answer now. The outcome row lands
 * a few seconds later, and the page refetches on the event.
 */
export async function readCompare(
  ctx: DaemonContext,
  idOrPrefix: string,
): Promise<CompareResponse> {
  const { compareId, siblings } = compareSiblings(ctx.ledger, idOrPrefix);
  const repo = resolveRepoId(ctx.ledger, siblings[0].repoId);
  const reconciled: Task[] = [];
  for (const task of siblings) {
    reconciled.push(await ctx.lifecycle.reconcile(task));
  }
  // One scan answers for every sibling: they are all in the same transcript tree (ADR 021).
  await ctx.usage.scan();
  const tasks: CompareTaskRow[] = [];
  for (const task of reconciled) {
    tasks.push(await compareRow(ctx, repo, task));
  }
  return {
    compareId,
    repoId: repo.id,
    // Every sibling was started from the one request, so the first one speaks for the group.
    prompt: siblings[0].prompt,
    title: siblings[0].title,
    tasks,
    pickedTaskId: pickedTaskId(ctx.ledger, tasks),
  };
}

/** Oldest first, which is the order the profiles were given in. */
export function compareSiblings(
  ledger: Ledger,
  idOrPrefix: string,
): { compareId: string; siblings: [Task, ...Task[]] } {
  const compareId = resolveCompareId(ledger, idOrPrefix);
  const siblings = ledger.tasks.list({ compareId }).reverse();
  const [first, ...rest] = siblings;
  if (first === undefined) {
    // The id came from the task rows themselves, so this is a compare emptied between two reads.
    throw new DaemonError(`no compare matches "${idOrPrefix}"`, {
      code: "compare-not-found",
      hint: "Run `agn compare show <id>` with an id `agn status` lists.",
    });
  }
  return { compareId, siblings: [first, ...rest] };
}

async function compareRow(ctx: DaemonContext, repo: Repo, task: Task): Promise<CompareTaskRow> {
  // A branch merged a minute ago reads as accepted here, as it does on the outcome route.
  await refreshVerdict(ctx, task).catch((cause: unknown) => {
    ctx.log.error("verdict not rechecked", { taskId: task.id, message: reason(cause) });
  });
  return {
    ...task,
    worktreePresent: task.worktreePath !== null && (await isDirectory(task.worktreePath)),
    outcome: ctx.ledger.outcomes.get(task.id),
    usage: ctx.ledger.usage.sumForTask(task.id),
    billing: await billingForProfile(ctx.detection, task.profileId),
    changes: await changesFor(ctx, repo, task),
  };
}

/** Null is git declining to answer, which is a fact about the branch and not a failed request. */
async function changesFor(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
): Promise<CompareChanges | null> {
  try {
    return summarizeChanges(await taskChanges(ctx, repo, task));
  } catch (cause) {
    if (cause instanceof DaemonError && NO_COUNT.includes(cause.code)) {
      ctx.log.info("changes not counted", { taskId: task.id, message: cause.message });
      return null;
    }
    throw cause;
  }
}

/** Binary files have no line counts, so they are in `files` and in neither of the other two. */
export function summarizeChanges(response: ChangesResponse): CompareChanges {
  return {
    files: response.files.length,
    additions: response.files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: response.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
  };
}

/**
 * What a pick left standing, read from how the siblings are now rather than from what once
 * happened to them: the sole sibling whose worktree is still there while at least one other has
 * been cleaned away. A sibling whose worktree a resume rebuilds stops counting as cleaned, so a
 * compare whose winner changed names the new one as soon as that worktree is back. It is derived,
 * never stored (ADR 036 Q7), so a compare cleaned by hand down to one survivor reads as picked -
 * which is the same fact.
 */
export function pickedTaskId(ledger: Ledger, rows: PickCandidate[]): string | null {
  const standing = rows.filter((row) => !isCleaned(ledger, row));
  // One sibling standing says nothing unless another was cleaned away: that is the choice.
  if (standing.length !== 1 || standing.length === rows.length) {
    return null;
  }
  return standing[0]?.id ?? null;
}

/** All the pick reads off a sibling: which one it is, and whether its worktree is on disk. */
type PickCandidate = { id: string; worktreePresent: boolean };

/**
 * Cleaned means both halves: agn recorded that it removed the worktree, and the worktree is not
 * there now. A task that never got one, and one whose directory a person deleted by hand, are
 * neither of them the record of a choice between siblings.
 */
function isCleaned(ledger: Ledger, row: PickCandidate): boolean {
  if (row.worktreePresent) {
    return false;
  }
  return ledger.events.forTask(row.id).some((event) => event.kind === "task.cleaned");
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
