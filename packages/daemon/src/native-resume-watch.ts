import type { Task } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";
import type { Logger } from "./log.js";

export type NativeResumeWatch = {
  /** A native resume whose id has not yet been proved by a hook, keyed by task. */
  launched(taskId: string, launchId: string): void;
  /** Any hook at all: the harness came up on the id it was given. */
  hookSeen(taskId: string): void;
  /** At close: clears the recorded id when that launch failed before its first hook. */
  closed(task: Task): void;
};

/**
 * The belt behind the pre-flight check in `session-evidence.ts`: when a harness was handed a
 * session id it turned out not to have, it prints its own error and exits non-zero without ever
 * sending a hook, and the id that killed the launch must not be handed to the next one. In memory
 * and with no timer, because it is only ever read in the same daemon life that wrote it.
 */
export function createNativeResumeWatch(deps: { ledger: Ledger; log: Logger }): NativeResumeWatch {
  const unproved = new Map<string, string>();
  return {
    launched: (taskId, launchId) => {
      unproved.set(taskId, launchId);
    },

    hookSeen: (taskId) => {
      unproved.delete(taskId);
    },

    closed: (task) => {
      const launchId = unproved.get(task.id);
      unproved.delete(task.id);
      const session = task.session;
      // Only a failure clears: a user's `agn stop` two seconds into a good resume keeps its id,
      // and a launch id that has moved on belongs to a later, fresh launch.
      if (
        launchId === undefined ||
        task.status !== "failed" ||
        session === undefined ||
        session.launchId !== launchId
      ) {
        return;
      }
      // The event this writes reads as a capture, so the log is where the un-capture is legible.
      deps.ledger.tasks.setSession(task.id, { ...session, sessionId: null });
      deps.log.warn("resumed session id cleared", { taskId: task.id });
    },
  };
}
