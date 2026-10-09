import { errorMessage, readTaskNote, type Task, writeTaskNote } from "@agnostic/core";
import type { Logger } from "./log.js";

/**
 * ADR 014: the note's front-matter status is written at run and on terminal transitions, never on
 * running or waiting flips - live status is the ledger's. A repo whose note is missing or whose
 * checkout has moved is not a reason to lose the transition, so nothing here throws.
 */
export async function syncTaskNote(repoPath: string, task: Task, log: Logger): Promise<void> {
  try {
    const note = await readTaskNote(repoPath, task.id);
    if (note === null || note.status === task.status) {
      return;
    }
    await writeTaskNote(repoPath, { ...note, status: task.status });
  } catch (cause) {
    log.error("task note not updated", {
      taskId: task.id,
      message: errorMessage(cause),
    });
  }
}
