import { type Task, TaskSchema, type TaskSession, type TaskStatus } from "@agnostic/core";
import type { Database } from "better-sqlite3";
import { LedgerError, rowInvalid, writeFailure } from "./error.js";
import type { EventQueries } from "./event-queries.js";

type TaskRow = {
  id: string;
  repo_id: string;
  title: string;
  prompt: string;
  profile_id: string;
  worktree_path: string | null;
  branch: string | null;
  status: string;
  origin: string;
  session_json: string | null;
  recommendation_json: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskFilter = {
  repoId?: string;
  status?: TaskStatus | TaskStatus[];
  /** The ADR 004 prefix a user types instead of a whole id. */
  idPrefix?: string;
  limit?: number;
};

/** What the executor decided at launch: the branch it chose and the session it is running in. */
export type StartedTask = { branch: string | null; session: TaskSession };

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

const COLUMNS =
  "id, repo_id, title, prompt, profile_id, worktree_path, branch, status, origin, session_json, recommendation_json, parent_task_id, created_at, updated_at";

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
    `INSERT INTO tasks (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    "UPDATE tasks SET branch = ?, session_json = ?, status = 'running', updated_at = ? WHERE id = ?",
  );
  return db.transaction((id: string, started: StartedTask): Task => {
    const current = requireTask(id);
    const updatedAt = new Date().toISOString();
    updateRow.run(started.branch, JSON.stringify(started.session), updatedAt, id);
    const meta = { ts: updatedAt, taskId: id, repoId: current.repoId } as const;
    events.append({ ...meta, kind: "session.captured", payload: { session: started.session } });
    if (current.status !== "running") {
      events.append({
        ...meta,
        kind: "task.status",
        payload: { from: current.status, to: "running" },
      });
    }
    return { ...current, ...started, status: "running", updatedAt };
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

function filterSql(filter: TaskFilter): { where: string; values: (string | number)[] } {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (filter.repoId !== undefined) {
    clauses.push("repo_id = ?");
    values.push(filter.repoId);
  }
  const statuses = filter.status === undefined ? [] : [filter.status].flat();
  if (statuses.length > 0) {
    clauses.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    values.push(...statuses);
  }
  if (filter.idPrefix !== undefined) {
    // The id alphabet has no LIKE wildcards, so a prefix needs no escaping.
    clauses.push("id LIKE ?");
    values.push(`${filter.idPrefix}%`);
  }
  return { where: clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`, values };
}

function notFound(id: string): LedgerError {
  return new LedgerError(`no task with id ${id}`, {
    code: "task-not-found",
    hint: "Run agn status to see the tasks agn knows about.",
  });
}

function toTask(row: TaskRow): Task {
  const parsed = TaskSchema.safeParse({
    id: row.id,
    repoId: row.repo_id,
    title: row.title,
    prompt: row.prompt,
    profileId: row.profile_id,
    worktreePath: row.worktree_path,
    branch: row.branch,
    status: row.status,
    origin: row.origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.session_json === null ? {} : { session: JSON.parse(row.session_json) as unknown }),
    ...(row.recommendation_json === null
      ? {}
      : { recommendation: JSON.parse(row.recommendation_json) as unknown }),
    ...(row.parent_task_id === null ? {} : { parentTaskId: row.parent_task_id }),
  });
  if (!parsed.success) {
    throw rowInvalid("tasks", parsed.error);
  }
  return parsed.data;
}
