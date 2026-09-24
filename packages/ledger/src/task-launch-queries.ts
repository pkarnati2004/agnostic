import type { Task, TaskSession } from "@agnostic/core";
import type { Database } from "better-sqlite3";
import type { EventQueries } from "./event-queries.js";

/** What the executor decided at launch: the branch, the commit it forked from, and the session. */
export type StartedTask = {
  branch: string | null;
  /** Null when a worktree or branch was reused, or the task has no branch at all. */
  baseCommit: string | null;
  session: TaskSession;
};

/** What a design task's start records: it has a worktree and a branch, and never a session. */
export type StartedWithoutSession = { branch: string | null; baseCommit: string | null };

/** Branch, session and running status in one write, so a task is never running with no session. */
export function markStarted(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): (id: string, started: StartedTask) => Task {
  const updateRow = db.prepare(
    `UPDATE tasks SET branch = ?, base_commit = COALESCE(?, base_commit), session_json = ?,
       status = 'running', updated_at = ? WHERE id = ?`,
  );
  return db.transaction((id: string, started: StartedTask): Task => {
    const current = requireTask(id);
    const updatedAt = new Date().toISOString();
    // A relaunch into an existing worktree has no base to report; the first one's stands.
    updateRow.run(
      started.branch,
      started.baseCommit,
      JSON.stringify(started.session),
      updatedAt,
      id,
    );
    const meta = { ts: updatedAt, taskId: id, repoId: current.repoId } as const;
    events.append({ ...meta, kind: "session.captured", payload: { session: started.session } });
    if (current.status !== "running") {
      events.append({
        ...meta,
        kind: "task.status",
        payload: { from: current.status, to: "running" },
      });
    }
    return {
      ...current,
      ...started,
      baseCommit: started.baseCommit ?? current.baseCommit,
      status: "running",
      updatedAt,
    };
  });
}

/**
 * A design task is worked on by a human in a design tool, so nothing will ever capture a session
 * for it: the row goes straight to waiting, and `agn stop` is what finishes it (ADR 036 Q15).
 */
export function markWaiting(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): (id: string, started: StartedWithoutSession) => Task {
  const updateRow = db.prepare(
    `UPDATE tasks SET branch = ?, base_commit = COALESCE(?, base_commit),
       status = 'waiting', updated_at = ? WHERE id = ?`,
  );
  return db.transaction((id: string, started: StartedWithoutSession): Task => {
    const current = requireTask(id);
    const updatedAt = new Date().toISOString();
    updateRow.run(started.branch, started.baseCommit, updatedAt, id);
    if (current.status !== "waiting") {
      events.append({
        ts: updatedAt,
        taskId: id,
        repoId: current.repoId,
        kind: "task.status",
        payload: { from: current.status, to: "waiting" },
      });
    }
    return {
      ...current,
      ...started,
      baseCommit: started.baseCommit ?? current.baseCommit,
      status: "waiting",
      updatedAt,
    };
  });
}
