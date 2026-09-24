import {
  designToolOf,
  type ExecutorProvider,
  type HarnessId,
  type SessionHandle,
  sessionHandle,
  type Task,
  type TaskSession,
} from "@agnostic/core";
import { DaemonError } from "./error.js";

/**
 * A design task is worked on by a human in a design tool, so resume, attach and update have
 * nothing to work with: there is no session now and there never was one.
 */
export function assertAgentTask(task: Task): void {
  if (designToolOf(task.profileId) === null) {
    return;
  }
  throw new DaemonError(`task ${task.id} is a design task and has no agent session`, {
    code: "design-task-no-session",
    hint: `Open the tool with \`agn open ${task.id} --tool\`; \`agn stop ${task.id}\` finishes it.`,
  });
}

/**
 * What the ledger records after a launch, for a first run and for a resume alike. `sessionId` is
 * the harness's own thread: null unless a native resume is carrying one forward (ADR 008).
 */
export function launchedSession(
  harness: HarnessId,
  handle: SessionHandle,
  sessionId: string | null,
): TaskSession {
  return {
    harness,
    sessionId,
    tmuxSession: handle.tmuxSession,
    tmuxSocket: handle.tmuxSocket,
    launchId: handle.launchId,
    // agn launched this one, so the pane is what it watches, not a pid of its own.
    pid: null,
    cwd: handle.cwd,
    lastSeenAt: new Date().toISOString(),
  };
}

/**
 * The handle a client may put in a terminal, for `GET /tasks/:id/attach` and for the terminal
 * socket alike. ADR 014: a session started outside tmux is agn's to watch, never agn's to attach.
 */
export async function attachableHandle(
  executor: ExecutorProvider,
  task: Task,
): Promise<SessionHandle> {
  assertAgentTask(task);
  const handle = sessionHandle(task);
  if (handle === null && task.session?.tmuxSession === null) {
    throw new DaemonError(`task ${task.id} was started outside tmux and cannot be attached to`, {
      code: "session-not-attachable",
      hint: `When it exits, run \`agn resume ${task.id}\` to continue it here.`,
    });
  }
  if (handle === null || (await executor.sessionState(handle)) !== "running") {
    throw new DaemonError(`task ${task.id} has no session running`, {
      code: "session-not-running",
      hint: `Run \`agn resume ${task.id}\` to start it again.`,
    });
  }
  return handle;
}
