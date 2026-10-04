import type { TaskListRow, TaskStatus } from "@agnostic/core";
import type { RepoGroup } from "./group-tasks";

/** Worst first: a repo's badge says the most it has to say, and says nothing about the rest. */
const PRECEDENCE: TaskStatus[] = ["waiting", "failed", "running"];

/**
 * The badge a repo's square in the rail carries, or null for a repo with nothing to report. Queued
 * and finished tasks draw none, so the collapsed sidebar is quiet until something wants a look.
 */
export function repoBadge(tasks: TaskListRow[]): TaskStatus | null {
  return PRECEDENCE.find((status) => tasks.some((task) => task.status === status)) ?? null;
}

/** Every task under a repo, live rows and history alike, a compare's siblings included. */
export function repoTasks(group: RepoGroup): TaskListRow[] {
  return [...group.rows, ...group.history].flatMap((row) =>
    row.kind === "task" ? [row.task, ...(row.child === null ? [] : [row.child])] : row.group.tasks,
  );
}
