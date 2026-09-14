import type { HarnessId } from "@agnostic/core";
import type { TranscriptTurn } from "./transcript-parser.js";

/**
 * A session agn started, as the ledger knows it. `cwd` is resolved by the caller, because the
 * harnesses write the resolved path and `/tmp` is a symlink on macOS. `endedAt` is null while the
 * task is still live.
 */
export type SessionOwner = {
  taskId: string;
  harness: HarnessId;
  sessionId: string | null;
  cwd: string;
  startedAt: string;
  endedAt: string | null;
};

/**
 * Which task each turn belongs to, keyed by task id, with the turns that belong to no task under
 * `null`. The harness's own session id is the strong answer; a directory is the fallback, and
 * only for the span the task held it, because a second task in the same folder comes later.
 */
export function attributeTurns(
  turns: TranscriptTurn[],
  owners: SessionOwner[],
): Map<string | null, TranscriptTurn[]> {
  const bySession = new Map<string, string>();
  for (const owner of owners) {
    if (owner.sessionId !== null) {
      bySession.set(sessionKey(owner.harness, owner.sessionId), owner.taskId);
    }
  }
  // Newest first, so the first owner whose window holds the turn is the most recent one.
  const byStart = [...owners].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const now = new Date().toISOString();
  const attributed = new Map<string | null, TranscriptTurn[]>();
  for (const turn of turns) {
    const taskId =
      bySession.get(sessionKey(turn.harness, turn.sessionId)) ?? inWorkspace(turn, byStart, now);
    const group = attributed.get(taskId);
    if (group === undefined) {
      attributed.set(taskId, [turn]);
    } else {
      group.push(turn);
    }
  }
  return attributed;
}

function sessionKey(harness: HarnessId, sessionId: string): string {
  return `${harness} ${sessionId}`;
}

function inWorkspace(turn: TranscriptTurn, owners: SessionOwner[], now: string): string | null {
  if (turn.cwd === null) {
    return null;
  }
  const cwd = trimSlash(turn.cwd);
  const owner = owners.find(
    (candidate) =>
      candidate.harness === turn.harness &&
      trimSlash(candidate.cwd) === cwd &&
      turn.ts >= candidate.startedAt &&
      turn.ts <= (candidate.endedAt ?? now),
  );
  return owner?.taskId ?? null;
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
