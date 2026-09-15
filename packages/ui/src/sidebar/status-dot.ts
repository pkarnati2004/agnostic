import type { TaskStatus } from "@agnostic/core";

/** The colour token and the word for each status, so the dot and its tooltip cannot disagree. */
export const STATUS_DOT: Record<TaskStatus, { token: string; label: string }> = {
  waiting: { token: "--status-waiting", label: "waiting for you" },
  running: { token: "--status-running", label: "running" },
  queued: { token: "--status-queued", label: "queued" },
  done: { token: "--status-done", label: "done" },
  failed: { token: "--status-failed", label: "failed" },
  stopped: { token: "--status-stopped", label: "stopped" },
};
