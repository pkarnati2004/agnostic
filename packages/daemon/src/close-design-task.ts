import {
  composeHandoffBody,
  DEFAULT_DESIGN_FOLDER,
  type DesignToolId,
  designToolOf,
  type Repo,
  readRepoConfig,
  readTaskNote,
  type Task,
} from "@agnostic/core";
import { designToolEntry } from "@agnostic/registry";
import type { DaemonContext } from "./app.js";
import { fileChanges } from "./branch-changes.js";
import { DaemonError } from "./error.js";
import { appendHandoff } from "./handoff-task.js";
import { initialTaskNote } from "./initial-task-note.js";
import { resolveRepoId } from "./resolve-id.js";

const LIVE: Task["status"][] = ["running", "waiting"];

/**
 * `agn stop` on a design task, which is how a design task finishes: it waits from the moment it
 * is created until a human says the design is done. The note gains a handoff section with no
 * recipient, so whoever continues - `agn run --base <task>` or `agn handoff` - reads what was
 * designed and where the files are (ADR 006).
 */
export async function closeDesignTask(ctx: DaemonContext, task: Task): Promise<Task> {
  const tool = designToolOf(task.profileId);
  if (tool === null) {
    throw new DaemonError(`task ${task.id} is not a design task`, {
      code: "not-a-design-task",
      hint: `Run \`agn stop ${task.id}\` to stop the agent running it.`,
    });
  }
  // A second stop finds a terminal task: the note already has its section, and one more would
  // describe the same design twice.
  if (!LIVE.includes(task.status)) {
    return task;
  }
  const repo = resolveRepoId(ctx.ledger, task.repoId);
  const done = await ctx.lifecycle.stop(task);
  try {
    await writeHandoff(ctx, repo, done, tool);
  } catch (cause) {
    // The close stands: the design is finished whether or not its note could be updated.
    ctx.log.error("design handoff note not written", {
      taskId: done.id,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
  return done;
}

/** What the next agent is told: the goal, the tool and folder, and what the design left behind. */
async function writeHandoff(
  ctx: DaemonContext,
  repo: Repo,
  done: Task,
  tool: DesignToolId,
): Promise<void> {
  const config = await readRepoConfig(repo.path);
  const folder = config?.designFolder ?? DEFAULT_DESIGN_FOLDER;
  const where = done.branch === null ? "the checkout" : `branch ${done.branch}`;
  const decisions = `Designed in ${designToolEntry(tool).name}. The files are in ${folder}/ on ${where}.`;
  const note = (await readTaskNote(repo.path, done.id)) ?? initialTaskNote(done, done.prompt);
  const body = composeHandoffBody({
    note: `### Goal\n${done.prompt}\n\n### Decisions\n${decisions}`,
    from: done,
    changes: await fileChanges(repo, done, config),
  });
  await appendHandoff(ctx, repo, done, note, { toProfileId: null, at: done.updatedAt, body });
}
