import {
  composeHandoffBody,
  type HandoffTaskRequest,
  type HandoffTaskResponse,
  newId,
  type Repo,
  readRepoConfig,
  readTaskNote,
  type Task,
  type TaskNote,
  type TaskNoteHandoff,
  worktreePath,
  writeTaskNote,
} from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { branchExists, fileChanges } from "./branch-changes.js";
import { DaemonError } from "./error.js";
import { assertFolderFree } from "./folder-guard.js";
import { initialTaskNote } from "./initial-task-note.js";
import { resolveRepoId } from "./resolve-id.js";
import { resolveProfile } from "./resolve-profile.js";
import { launchQueued } from "./start-task.js";

/**
 * ADR 020: the work moves to another agent and the lineage stays in the repo. The parent stops,
 * its note gains one Handoff section, and the child starts from the parent's branch with that
 * section as the Handoff part of its first prompt. Order is validate, stop, row, note, launch:
 * everything that can refuse the handoff does so before the parent's session is touched, and the
 * section is written once there is a child for it to name.
 */
export async function handoffTask(
  ctx: DaemonContext,
  parent: Task,
  req: HandoffTaskRequest,
): Promise<HandoffTaskResponse> {
  const repo = resolveRepoId(ctx.ledger, parent.repoId);
  const profile = await resolveProfile(ctx, repo, { profile: req.profile });
  const config = await readRepoConfig(repo.path);
  const base = await handoffBase(repo, parent);
  const from = await stopParent(ctx, repo, parent);
  const note = (await readTaskNote(repo.path, from.id)) ?? initialTaskNote(from, from.prompt);
  const body = composeHandoffBody({
    note: req.note ?? null,
    from,
    changes: await fileChanges(repo, from, config),
  });
  const child = insertChild(ctx, repo, {
    from,
    profileId: profile.id,
    spec: note.spec,
    at: new Date().toISOString(),
    body,
  });
  // The section is found by the timestamp the child row carries, so the row is what dates it.
  await appendHandoff(ctx, repo, from, note, {
    toProfileId: profile.id,
    at: child.createdAt,
    body,
  });
  return {
    task: await launchQueued(ctx, repo, child, {
      profile,
      config,
      base,
      note: childNote(child, note),
    }),
    parent: from,
  };
}

/**
 * ADR 013: the child continues the parent's branch, so the commits it inherits are the ones the
 * note describes. A folder parent has no branch and the child runs in the checkout it just left.
 */
async function handoffBase(repo: Repo, parent: Task): Promise<string | null> {
  if (repo.kind !== "git" || parent.branch === null) {
    return null;
  }
  if (await branchExists(repo.path, parent.branch)) {
    return parent.branch;
  }
  throw new DaemonError(`the branch ${parent.branch} of task ${parent.id} no longer exists`, {
    code: "branch-gone",
    hint: '`agn run "<prompt>"` starts over; the branch was deleted.',
  });
}

/** A terminal parent is left as it is; a live one is stopped, which frees a folder workspace. */
async function stopParent(ctx: DaemonContext, repo: Repo, parent: Task): Promise<Task> {
  if (repo.kind === "folder") {
    // The route reconciled the parent; the folder guard below judges the parent's siblings too,
    // and a sibling that died unnoticed would hold the folder against a child that could have it.
    await ctx.lifecycle.reconcileAll();
  }
  return await ctx.lifecycle.stop(ctx.ledger.tasks.get(parent.id) ?? parent);
}

/**
 * ADR 014: the note is repo history, not the ledger - it is written after the transaction, so a
 * refused handoff cannot leave a section naming a child that was never created, and a note that
 * cannot be written loses the context rather than the child that already exists.
 */
async function appendHandoff(
  ctx: DaemonContext,
  repo: Repo,
  from: Task,
  note: TaskNote,
  handoff: TaskNoteHandoff,
): Promise<void> {
  try {
    // The front-matter status is written on handoff, so the committed note is not left stale.
    await writeTaskNote(repo.path, {
      ...note,
      status: from.status,
      handoffs: [...note.handoffs, handoff],
    });
  } catch (cause) {
    ctx.log.error("handoff note not written", {
      taskId: from.id,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

type ChildInput = { from: Task; profileId: string; spec: string; at: string; body: string };

/**
 * The child row and the event that explains it are one transaction, and the event belongs to the
 * parent: the lineage is read from the task that was handed over (ADR 007, no row of its own).
 */
function insertChild(ctx: DaemonContext, repo: Repo, input: ChildInput): Task {
  const id = newId();
  const child: Task = {
    id,
    repoId: repo.id,
    title: input.from.title,
    prompt: input.spec,
    profileId: input.profileId,
    worktreePath: repo.kind === "git" ? worktreePath(ctx.paths, repo.id, id) : null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    parentTaskId: input.from.id,
    // The prompt composer finds the section by this timestamp, so the row and the note share it.
    createdAt: input.at,
    updatedAt: input.at,
  };
  return ctx.ledger.transaction(() => {
    assertFolderFree(ctx.ledger, repo);
    const inserted = ctx.ledger.tasks.insert(child);
    ctx.ledger.events.append({
      ts: input.at,
      taskId: input.from.id,
      repoId: repo.id,
      kind: "task.handoff",
      payload: {
        fromProfileId: input.from.profileId,
        toProfileId: input.profileId,
        childTaskId: id,
        note: input.body,
      },
    });
    return inserted;
  });
}

/** The child inherits what the task is, not what happened to it: no handoffs, no notes. */
function childNote(child: Task, parent: TaskNote): TaskNote {
  return { ...initialTaskNote(child, parent.spec), acceptance: parent.acceptance };
}
