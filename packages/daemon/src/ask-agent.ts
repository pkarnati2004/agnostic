import { isLive, type ResumeTaskResponse, sessionHandle, type Task } from "@agnostic/core";
import type { DaemonContext } from "./app.js";
import { DaemonError } from "./error.js";
import type { ExtraSection } from "./launch-command.js";
import { resumeTask } from "./resume-task.js";

export type AskedTurn = { task: Task; via: ResumeTaskResponse["via"] };

/**
 * How agn asks an agent for one more thing (ADR 036 Q6): a session that is still running is typed
 * into, and anything else takes the resume tree with the turn as its first one. agn runs none of
 * what it asks for - the agent does it in its own session, or does not.
 */
export async function askAgent(
  ctx: DaemonContext,
  task: Task,
  turn: ExtraSection,
): Promise<AskedTurn> {
  assertReachable(task, turn.body);
  // One liveness check and one race window: the resume answers `live` for a session still running,
  // and the turn is typed into that session rather than launched with a new one.
  const result = await resumeTask(ctx, task, { turn });
  const handle = sessionHandle(result.task);
  if (result.via === "live" && handle !== null) {
    await ctx.executor.send(handle, turn.body);
  }
  return { task: result.task, via: result.via };
}

/** A session started outside tmux is agn's to watch, never agn's to type into (ADR 014). */
function assertReachable(task: Task, prompt: string): void {
  if (task.session?.tmuxSession === null && isLive(task.status)) {
    throw new DaemonError(`task ${task.id} was started outside tmux, so agn cannot type into it`, {
      code: "session-not-attachable",
      hint: `Type the prompt into that terminal yourself: ${prompt}`,
    });
  }
}
