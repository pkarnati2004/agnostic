import { type Task, TaskSchema } from "@agnostic/core";
import { rowInvalid } from "./error.js";
import type { TaskFilter } from "./task-queries.js";

/** The tasks table as SQLite hands it back; every query in this package reads rows through here. */
export type TaskRow = {
  id: string;
  repo_id: string;
  title: string;
  prompt: string;
  profile_id: string;
  worktree_path: string | null;
  branch: string | null;
  status: string;
  origin: string;
  base_commit: string | null;
  compare_id: string | null;
  session_json: string | null;
  recommendation_json: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
};

export const COLUMNS =
  "id, repo_id, title, prompt, profile_id, worktree_path, branch, status, origin, base_commit, compare_id, session_json, recommendation_json, parent_task_id, created_at, updated_at";

export function filterSql(filter: TaskFilter): { where: string; values: (string | number)[] } {
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
  if (filter.compareId !== undefined) {
    clauses.push("compare_id = ?");
    values.push(filter.compareId);
  }
  if (filter.idPrefix !== undefined) {
    // The id alphabet has no LIKE wildcards, so a prefix needs no escaping.
    clauses.push("id LIKE ?");
    values.push(`${filter.idPrefix}%`);
  }
  return { where: clauses.length === 0 ? "" : ` WHERE ${clauses.join(" AND ")}`, values };
}

export function toTask(row: TaskRow): Task {
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
    baseCommit: row.base_commit,
    compareId: row.compare_id,
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
