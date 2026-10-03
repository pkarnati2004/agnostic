import type { AskCommitResponse, TaskListRow, TaskStatus } from "@agnostic/core";
import { worktreeGone } from "../task/worktree-gone";

const LIVE: TaskStatus[] = ["running", "waiting"];
const RESUMABLE: TaskStatus[] = ["done", "failed", "stopped"];

/** What the panel says once the daemon has answered: where the prompt went, and what to do next. */
export function commitLine(response: AskCommitResponse): string {
  return response.via === "live"
    ? "Asked the agent to commit in its session. Refresh shows the commit once it lands."
    : "Resumed the task and asked it to commit. Refresh shows the commit once it lands.";
}

/**
 * Whether there is an agent to ask and something for it to commit. The one rule the panel's button
 * and the palette's row share, so neither offers a click the daemon would refuse. `uncommitted` is
 * null until the Changes panel has read the task once; nothing else knows the count.
 */
export function canAskCommit(task: TaskListRow, uncommitted: number | null): boolean {
  if (task.branch === null || task.worktreePath === null || worktreeGone(task)) {
    return false;
  }
  if (uncommitted === null || uncommitted === 0) {
    return false;
  }
  return LIVE.includes(task.status) || RESUMABLE.includes(task.status);
}
