import { type Repo, type RepoKind, RepoSchema, type RepoStatus } from "@agnostic/core";
import type { Database } from "better-sqlite3";
import { LedgerError, rowInvalid, writeFailure } from "./error.js";
import type { EventQueries } from "./event-queries.js";

type RepoRow = {
  id: string;
  path: string;
  kind: string;
  name: string;
  added_at: string;
  status: string;
};

export type RepoPatch = { path?: string; kind?: RepoKind; name?: string; status?: RepoStatus };

export type RepoFilter = { status?: RepoStatus };

export type RepoQueries = {
  insert(repo: Repo): Repo;
  update(id: string, patch: RepoPatch): Repo;
  get(id: string): Repo | null;
  /** Exact match; resolving a user-typed path to a real one is the caller's job. */
  getByPath(path: string): Repo | null;
  /** No filter is every row: a closed repo still resolves by id or prefix (ADR 032). */
  list(filter?: RepoFilter): Repo[];
};

export function createRepoQueries(db: Database, events: EventQueries): RepoQueries {
  const selectById = db.prepare("SELECT * FROM repos WHERE id = ?");
  const selectByPath = db.prepare("SELECT * FROM repos WHERE path = ?");
  const selectAll = db.prepare("SELECT * FROM repos ORDER BY added_at, id");
  const selectByStatus = db.prepare("SELECT * FROM repos WHERE status = ? ORDER BY added_at, id");

  const get = (id: string): Repo | null => {
    const row = selectById.get(id) as RepoRow | undefined;
    return row === undefined ? null : toRepo(row);
  };

  return {
    insert: insertRepo(db, events),
    update: updateRepo(db, events, get),
    get,
    getByPath(path: string): Repo | null {
      const row = selectByPath.get(path) as RepoRow | undefined;
      return row === undefined ? null : toRepo(row);
    },
    list(filter: RepoFilter = {}): Repo[] {
      const rows =
        filter.status === undefined ? selectAll.all() : selectByStatus.all(filter.status);
      return (rows as RepoRow[]).map(toRepo);
    },
  };
}

function insertRepo(db: Database, events: EventQueries): RepoQueries["insert"] {
  const insertRow = db.prepare(
    "INSERT INTO repos (id, path, kind, name, added_at, status) VALUES (?, ?, ?, ?, ?, ?)",
  );
  return db.transaction((repo: Repo): Repo => {
    try {
      insertRow.run(repo.id, repo.path, repo.kind, repo.name, repo.addedAt, repo.status);
    } catch (cause) {
      throw writeFailure(cause, { unique: () => alreadyRegistered(repo.path, cause) });
    }
    events.append({
      ts: repo.addedAt,
      repoId: repo.id,
      kind: "repo.registered",
      payload: { repo },
    });
    return repo;
  });
}

function updateRepo(
  db: Database,
  events: EventQueries,
  get: (id: string) => Repo | null,
): RepoQueries["update"] {
  const updateRow = db.prepare(
    "UPDATE repos SET path = ?, kind = ?, name = ?, status = ? WHERE id = ?",
  );
  return db.transaction((id: string, patch: RepoPatch): Repo => {
    const current = get(id);
    if (current === null) {
      throw notFound(id);
    }
    const repo: Repo = { ...current, ...patch };
    // A patch that restates what the row already holds is not an update, so nothing is written.
    if (
      repo.path === current.path &&
      repo.kind === current.kind &&
      repo.name === current.name &&
      repo.status === current.status
    ) {
      return current;
    }
    try {
      updateRow.run(repo.path, repo.kind, repo.name, repo.status, id);
    } catch (cause) {
      throw writeFailure(cause, { unique: () => alreadyRegistered(repo.path, cause) });
    }
    events.append({
      ts: new Date().toISOString(),
      repoId: id,
      kind: "repo.updated",
      payload: { repo },
    });
    return repo;
  });
}

function alreadyRegistered(path: string, cause: unknown): LedgerError {
  return new LedgerError(`${path} is already a registered repo`, {
    code: "repo-exists",
    hint: "Run agn repos to see the repos agn knows about.",
    cause,
  });
}

function notFound(id: string): LedgerError {
  return new LedgerError(`no repo with id ${id}`, {
    code: "repo-not-found",
    hint: "Run agn repos to see the repos agn knows about.",
  });
}

function toRepo(row: RepoRow): Repo {
  const parsed = RepoSchema.safeParse({
    id: row.id,
    path: row.path,
    kind: row.kind,
    name: row.name,
    addedAt: row.added_at,
    status: row.status,
  });
  if (!parsed.success) {
    throw rowInvalid("repos", parsed.error);
  }
  return parsed.data;
}
