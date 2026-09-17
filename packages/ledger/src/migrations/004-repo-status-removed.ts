import type { Migration } from "../migrate.js";

// Removed means hidden for good: the rows stay, so the recommender keeps the history (ADR 034).
// SQLite cannot alter a CHECK, so this rebuilds the table the documented way. `tasks.repo_id` is
// left saying REFERENCES repos(id) - the name the new table takes - which is why the runner turns
// foreign keys off around a migration and checks the rows before it commits.
export const repoStatusRemoved: Migration = {
  version: 4,
  name: "repo-status-removed",
  sql: `
CREATE TABLE repos_new (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('git', 'folder')),
  name TEXT NOT NULL,
  added_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'removed'))
);

INSERT INTO repos_new (id, path, kind, name, added_at, status)
  SELECT id, path, kind, name, added_at, status FROM repos;

DROP TABLE repos;

ALTER TABLE repos_new RENAME TO repos;
`,
};
