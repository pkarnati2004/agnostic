import type { Task, TaskSession, TaskStatus } from "@agnostic/core";
import type { Database } from "better-sqlite3";
import { LedgerError, writeFailure } from "./error.js";
import type { EventQueries } from "./event-queries.js";
import { COLUMNS, filterSql, type TaskRow, toTask } from "./task-row.js";

export type TaskFilter = {
  repoId?: string;
  status?: TaskStatus | TaskStatus[];
  /** The ADR 004 prefix a user types instead of a whole id. */
  idPrefix?: string;
  limit?: number;
};

/** What the executor decided at launch: the branch, the commit it forked from, and the session. */
export type StartedTask = {
  branch: string | null;
  /** Null when a worktree or branch was reused, or the task has no branch at all. */
  baseCommit: string | null;
  session: TaskSession;
};

export type TaskQueries = {
  insert(task: Task): Task;
  setStatus(id: string, to: TaskStatus): Task;
  setSession(id: string, session: TaskSession): Task;
  /** Branch, session and running status in one write, so a task is never running with no session. */
  start(id: string, started: StartedTask): Task;
  /** The worktree agn removed; the row keeps its path and branch as the record of what ran. */
  clean(id: string, deletedBranch: boolean): Task;
  get(id: string): Task | null;
  list(filter?: TaskFilter): Task[];
};

export function createTaskQueries(db: Database, events: EventQueries): TaskQueries {
  const selectById = db.prepare("SELECT * FROM tasks WHERE id = ?");

  const get = (id: string): Task | null => {
    const row = selectById.get(id) as TaskRow | undefined;
    return row === undefined ? null : toTask(row);
  };

  const requireTask = (id: string): Task => {
    const task = get(id);
    if (task === null) {
      throw notFound(id);
    }
    return task;
  };

  return {
    insert: insertTask(db, events, get),
    setStatus: setTaskStatus(db, events, requireTask),
    setSession: setTaskSession(db, events, requireTask),
    start: markStarted(db, events, requireTask),
    clean: markCleaned(db, events, requireTask),
    get,
    list(filter: TaskFilter = {}): Task[] {
      const { where, values } = filterSql(filter);
      const limit = filter.limit === undefined ? "" : " LIMIT ?";
      if (filter.limit !== undefined) {
        values.push(filter.limit);
      }
      const sql = `SELECT * FROM tasks${where} ORDER BY created_at DESC, id DESC${limit}`;
      return (db.prepare(sql).all(...values) as TaskRow[]).map(toTask);
    },
  };
}

function insertTask(
  db: Database,
  events: EventQueries,
  get: (id: string) => Task | null,
): TaskQueries["insert"] {
  const insertRow = db.prepare(
    `INSERT INTO tasks (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return db.transaction((task: Task): Task => {
    // Checked here so a missing parent is not reported as a missing repo: both are the same
    // foreign key failure to SQLite.
    if (task.parentTaskId !== undefined && get(task.parentTaskId) === null) {
      throw notFound(task.parentTaskId);
    }
    try {
      insertRow.run(
        task.id,
        task.repoId,
        task.title,
        task.prompt,
        task.profileId,
        task.worktreePath,
        task.branch,
        task.status,
        task.origin,
        task.baseCommit,
        task.session === undefined ? null : JSON.stringify(task.session),
        task.recommendation === undefined ? null : JSON.stringify(task.recommendation),
        task.parentTaskId ?? null,
        task.createdAt,
        task.updatedAt,
      );
    } catch (cause) {
      throw insertFailure(task, cause);
    }
    events.append({
      ts: task.createdAt,
      taskId: task.id,
      repoId: task.repoId,
      kind: "task.created",
      payload: { task },
    });
    return task;
  });
}

function setTaskStatus(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): TaskQueries["setStatus"] {
  const updateRow = db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?");
  return db.transaction((id: string, to: TaskStatus): Task => {
    const current = requireTask(id);
    // A repeat of the status a task already has is not a transition, so nothing is written.
    if (current.status === to) {
      return current;
    }
    const updatedAt = new Date().toISOString();
    updateRow.run(to, updatedAt, id);
    events.append({
      ts: updatedAt,
      taskId: id,
      repoId: current.repoId,
      kind: "task.status",
      payload: { from: current.status, to },
    });
    return { ...current, status: to, updatedAt };
  });
}

function setTaskSession(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): TaskQueries["setSession"] {
  const updateRow = db.prepare("UPDATE tasks SET session_json = ?, updated_at = ? WHERE id = ?");
  return db.transaction((id: string, session: TaskSession): Task => {
    const current = requireTask(id);
    const updatedAt = new Date().toISOString();
    updateRow.run(JSON.stringify(session), updatedAt, id);
    events.append({
      ts: updatedAt,
      taskId: id,
      repoId: current.repoId,
      kind: "session.captured",
      payload: { session },
    });
    return { ...current, session, updatedAt };
  });
}

function markStarted(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): TaskQueries["start"] {
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

function markCleaned(
  db: Database,
  events: EventQueries,
  requireTask: (id: string) => Task,
): TaskQueries["clean"] {
  const touchRow = db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?");
  return db.transaction((id: string, deletedBranch: boolean): Task => {
    const current = requireTask(id);
    const updatedAt = new Date().toISOString();
    touchRow.run(updatedAt, id);
    events.append({
      ts: updatedAt,
      taskId: id,
      repoId: current.repoId,
      kind: "task.cleaned",
      payload: { deletedBranch },
    });
    return { ...current, updatedAt };
  });
}

function insertFailure(task: Task, cause: unknown): LedgerError {
  return writeFailure(cause, {
    unique: () =>
      new LedgerError(`a task with id ${task.id} already exists`, {
        code: "task-exists",
        hint: "Task ids come from newId(); reuse one only when resuming.",
        cause,
      }),
    "foreign-key": () =>
      new LedgerError(`no repo with id ${task.repoId}`, {
        code: "repo-not-found",
        hint: "Run agn add <path> before starting a task in a repo.",
        cause,
      }),
  });
}

function notFound(id: string): LedgerError {
  return new LedgerError(`no task with id ${id}`, {
    code: "task-not-found",
    hint: "Run agn status to see the tasks agn knows about.",
  });
}
