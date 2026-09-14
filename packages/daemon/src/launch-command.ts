import {
  composeLaunchPrompt,
  type LaunchCommand,
  type LaunchPromptInput,
  type Profile,
  type Repo,
  type RepoStateInput,
  readAgText,
  readTaskNote,
  type Task,
  type TaskNoteHandoff,
} from "@agnostic/core";
import { AGN_TASK_ID } from "@agnostic/hooks";
import { launchSpec, RegistryError, resumeSpec } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { initialTaskNote } from "./initial-task-note.js";

const OPEN: Task["status"][] = ["queued", "running", "waiting"];
const DONE_SHOWN = 5;

// A harness that cannot take a session id back, on this route or at all, starts fresh instead.
const FALLS_BACK_TO_FRESH = new Set(["resume-unsupported", "session-id-invalid"]);

/** A first start, or a resume with no session id: the whole task context in one prompt. */
export async function freshLaunchCommand(
  ctx: DaemonContext,
  repo: Repo,
  task: Task,
  profile: Profile,
): Promise<LaunchCommand> {
  const prompt = composeLaunchPrompt(await promptInput(ctx, repo, task));
  // A profile on the local route is launched against whichever server detection found serving it.
  const { servers } = await ctx.detection.current();
  const spec = launchSpec(profile, { prompt, env: ctx.env, servers });
  return {
    command: spec.command,
    args: spec.args,
    // The task id every hook this session fires carries back.
    env: { ...ctx.env, ...spec.env, [AGN_TASK_ID]: task.id },
    promptAfterStart: spec.promptAfterStart,
  };
}

/**
 * ADR 008: a harness that records its own session id can be handed it back, and the conversation
 * returns with nothing re-prompted. Null means this task has no such route, so the caller composes
 * the context prompt instead.
 */
export function resumeLaunchCommand(
  task: Task,
  profile: Profile,
  env: Record<string, string>,
): LaunchCommand | null {
  const sessionId = task.session?.sessionId ?? null;
  if (sessionId === null) {
    return null;
  }
  try {
    const spec = resumeSpec(profile, sessionId, env);
    return {
      command: spec.command,
      args: spec.args,
      // The task id every hook this session fires carries back.
      env: { ...env, ...spec.env, [AGN_TASK_ID]: task.id },
      promptAfterStart: null,
    };
  } catch (cause) {
    if (cause instanceof RegistryError && FALLS_BACK_TO_FRESH.has(cause.code)) {
      return null;
    }
    throw cause;
  }
}

/**
 * What the repo was doing, for a launch prompt or for a spec call. The task being launched is
 * excluded from the in-flight list; a spec is written before any task exists, so it excludes none.
 */
export async function repoStateInput(
  ctx: DaemonContext,
  repo: Repo,
  excludeTaskId: string | null,
): Promise<RepoStateInput> {
  const done = ctx.ledger.tasks.list({ repoId: repo.id, status: "done", limit: DONE_SHOWN });
  return {
    done: done.map((row) => ({ task: row, outcome: ctx.ledger.outcomes.get(row.id) })),
    inFlight: ctx.ledger.tasks
      .list({ repoId: repo.id, status: OPEN })
      .filter((row) => row.id !== excludeTaskId),
    decisions: await readAgText(repo.path, "decisions.md"),
  };
}

/**
 * The spec comes from the note on disk, so a task the human edited is launched with what they
 * wrote; a note deleted since the run falls back to the prompt the task was created with.
 */
async function promptInput(ctx: DaemonContext, repo: Repo, task: Task): Promise<LaunchPromptInput> {
  return {
    task,
    note: (await readTaskNote(repo.path, task.id)) ?? initialTaskNote(task, task.prompt),
    ...(await repoStateInput(ctx, repo, task.id)),
    handoff: await parentHandoff(repo, task),
  };
}

/**
 * The section the handoff that created this task wrote into the parent's note, matched by the
 * timestamp the two share. A task resumed fresh months later reads the same section again, and a
 * note whose sections were edited by hand falls back to the last one.
 */
async function parentHandoff(repo: Repo, task: Task): Promise<TaskNoteHandoff | null> {
  const parentId = task.parentTaskId;
  if (parentId === undefined) {
    return null;
  }
  const note = await readTaskNote(repo.path, parentId);
  if (note === null) {
    return null;
  }
  return (
    note.handoffs.find((handoff) => handoff.at === task.createdAt) ?? note.handoffs.at(-1) ?? null
  );
}
