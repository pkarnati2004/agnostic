import type { Task } from "@agnostic/core";

/** What the task row alone says the tab should be doing, before any socket is opened. */
export type SessionTarget = "starting" | "attach" | "ended" | "unattachable";

export function sessionTarget(task: Task): SessionTarget {
  if (task.status === "queued") {
    return "starting";
  }
  if (task.status !== "running" && task.status !== "waiting") {
    return "ended";
  }
  // An adopted session outside tmux: agn watches the process and can never attach to it.
  return task.session?.tmuxSession === null ? "unattachable" : "attach";
}
