import type { HarnessId, SessionHandle, TaskSession } from "@agnostic/core";

/**
 * What the ledger records after a launch, for a first run and for a resume alike. `sessionId` is
 * the harness's own thread: null unless a native resume is carrying one forward (ADR 008).
 */
export function launchedSession(
  harness: HarnessId,
  handle: SessionHandle,
  sessionId: string | null,
): TaskSession {
  return {
    harness,
    sessionId,
    tmuxSession: handle.tmuxSession,
    tmuxSocket: handle.tmuxSocket,
    launchId: handle.launchId,
    // agn launched this one, so the pane is what it watches, not a pid of its own.
    pid: null,
    cwd: handle.cwd,
    lastSeenAt: new Date().toISOString(),
  };
}
