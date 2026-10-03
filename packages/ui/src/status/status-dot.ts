import type { TaskStatus } from "@agnostic/core";

/** Filled means the task wants you or is moving; hollow means it has settled. */
export type StatusShape = "halo" | "filled" | "spinner" | "ring" | "square";

/** The token, the word and the shape per status, so the glyph, the pill and the tooltip cannot disagree. */
export const STATUS_DOT: Record<TaskStatus, { token: string; label: string; shape: StatusShape }> =
  {
    waiting: { token: "--status-waiting", label: "Waiting for you", shape: "halo" },
    running: { token: "--status-running", label: "Running", shape: "filled" },
    queued: { token: "--status-queued", label: "Running tests", shape: "spinner" },
    done: { token: "--status-done", label: "Done", shape: "ring" },
    failed: { token: "--status-failed", label: "Failed", shape: "filled" },
    stopped: { token: "--status-stopped", label: "Stopped", shape: "square" },
  };
