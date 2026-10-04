-- The tables `~/.copilot/session-store.db` keeps, cut down to the columns agn reads. The names are
-- the 2026-09-30 survey's reading of Copilot's store and are unverified live: a test builds
-- session-store.db in a temp directory from this file and one of the rows-*.sql files beside it.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  cwd TEXT,
  created_at INTEGER
);

CREATE TABLE assistant_usage_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER
);
