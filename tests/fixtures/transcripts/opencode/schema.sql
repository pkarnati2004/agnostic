-- The tables OpenCode's data directory keeps, cut down to the columns agn reads. A test builds
-- opencode.db in a temp directory from this file and one of the rows-*.sql files beside it; no
-- database is committed.
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  time_created INTEGER NOT NULL,
  time_updated INTEGER,
  directory TEXT,
  title TEXT
);
