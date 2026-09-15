import type { TerminalServerFrame, TerminalSize } from "@agnostic/core";

/** The one text frame the page sends. The daemon parses it with zod; this is the same shape. */
export function encodeResize(size: TerminalSize): string {
  return JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows });
}

/**
 * A text frame from the daemon, or null for anything this page does not know about: a newer daemon
 * may send a frame this build has never heard of, and a tab that drops it keeps working.
 */
export function decodeServerFrame(text: string): TerminalServerFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const frame = parsed as { type?: unknown; code?: unknown };
  if (frame.type === "ready") {
    return { type: "ready" };
  }
  if (frame.type !== "exit") {
    return null;
  }
  return typeof frame.code === "number" ? { type: "exit", code: frame.code } : { type: "exit" };
}
