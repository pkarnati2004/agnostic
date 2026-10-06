/** Every status a task can hold. `task.ts` builds the schema from this list. */
export const TASK_STATUSES = ["queued", "running", "waiting", "done", "failed", "stopped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** A task with a session behind it: the harness is working, or waiting on the user. */
export const LIVE_STATUSES: readonly TaskStatus[] = ["running", "waiting"];

/** A task that has stopped for good, however it stopped: only a resume moves it again. */
export const CLOSED_STATUSES: readonly TaskStatus[] = ["done", "failed", "stopped"];

export function isLive(status: TaskStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

export function isClosed(status: TaskStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}
