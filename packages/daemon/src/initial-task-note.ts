import type { Task, TaskNote } from "@agnostic/core";

/**
 * The note agn writes when a task appears: `agn run` puts the approved spec in, or the prompt when
 * there is none, and `agn adopt` says where the session came from. Everything after that is the
 * human's to edit, so nothing here rewrites a note that already exists.
 */
export function initialTaskNote(
  task: Task,
  spec: string,
  acceptance: string | null = null,
): TaskNote {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    profileId: task.profileId,
    createdAt: task.createdAt,
    parentTaskId: task.parentTaskId ?? null,
    spec,
    acceptance,
    notes: null,
    handoffs: [],
  };
}
