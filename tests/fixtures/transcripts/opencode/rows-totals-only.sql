-- A newer OpenCode that keeps running totals on the session and no message rows at all.
ALTER TABLE session ADD COLUMN cost REAL NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN tokens_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN tokens_output INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN tokens_reasoning INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session ADD COLUMN tokens_cache_read INTEGER NOT NULL DEFAULT 0;

INSERT INTO session (
  id, time_created, time_updated, directory, title,
  cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read
) VALUES ('ses_totals', 1788000000000, 1788000005000, '/work/repo', 'a task', 0.12, 900, 300, 0, 400);
