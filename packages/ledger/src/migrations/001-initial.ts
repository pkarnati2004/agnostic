import type { Migration } from "../migrate.js";

// Timestamps are ISO strings so string comparison orders them; booleans are 0/1.
export const initial: Migration = {
  version: 1,
  name: "initial",
  sql: `
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('git', 'folder')),
  name TEXT NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  worktree_path TEXT,
  branch TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting', 'done', 'failed', 'stopped')),
  origin TEXT NOT NULL DEFAULT 'agn' CHECK (origin IN ('agn', 'adopted')),
  session_json TEXT,
  recommendation_json TEXT,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX tasks_repo_status ON tasks(repo_id, status, created_at);

-- No foreign keys here: the history outlives the rows it talks about.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  task_id TEXT,
  repo_id TEXT,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX events_task ON events(task_id, id);

CREATE TABLE usage (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
  harness TEXT NOT NULL,
  model TEXT,
  tokens INTEGER NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_cache_read INTEGER,
  tokens_cache_write INTEGER,
  cost_usd REAL,
  source TEXT NOT NULL CHECK (source IN ('transcript', 'hook')),
  -- ref is the dedupe key a rescan of the same transcript entry produces.
  ref TEXT UNIQUE
);

CREATE INDEX usage_ts ON usage(ts, harness);

CREATE TABLE outcomes (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE RESTRICT,
  tests_before INTEGER,
  tests_after INTEGER,
  accepted INTEGER,
  reverted INTEGER,
  agent_lines INTEGER,
  human_changed_lines INTEGER,
  human_edit_ratio REAL,
  duration_sec REAL NOT NULL,
  cost_usd REAL,
  tokens INTEGER NOT NULL,
  resolved_model TEXT,
  recorded_at TEXT NOT NULL
);
`,
};
