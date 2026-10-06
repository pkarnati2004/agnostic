import type { Task } from "@agnostic/core";
import type { Database } from "better-sqlite3";
import type { EventQueries } from "./event-queries.js";
import type { TaskQueries } from "./task-queries.js";

/**
 * ADR 037: everything the task's own records hold goes, in one transaction. The usage rows are the
 * exception: a rescan of the harness's transcripts would insert them again by `ref`, so their task
 * id is cleared instead and the tokens stay in the totals, read as unattributed.
 */
export function deleteTaskRows(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): TaskQueries["delete"] {
  const deleteOutcome = db.prepare("DELETE FROM outcomes WHERE task_id = ?");
  const detachUsage = db.prepare("UPDATE usage SET task_id = NULL WHERE task_id = ?");
  const deleteEvents = db.prepare("DELETE FROM events WHERE task_id = ?");
  const deleteRow = db.prepare("DELETE FROM tasks WHERE id = ?");
  return db.transaction((id: string, input: { removedWorktree: boolean }): void => {
    const current = requireTask(id);
    deleteOutcome.run(id);
    detachUsage.run(id);
    deleteEvents.run(id);
    // A handoff child's parent_task_id becomes null by the schema, so the child stays as a root.
    deleteRow.run(id);
    // Appended last, so it is the one event about this task the deletion above cannot take with it.
    events.append({
      ts: new Date().toISOString(),
      taskId: id,
      repoId: current.repoId,
      kind: "task.deleted",
      payload: { removedWorktree: input.removedWorktree },
    });
  });
}
