INSERT INTO sessions (id, cwd, created_at) VALUES ('cop-s1', '/work/repo', 1788000000000);
-- A session Copilot started and billed nothing for: no event, so no row.
INSERT INTO sessions (id, cwd, created_at) VALUES ('cop-s2', '/work/other', 1788000100000);

INSERT INTO assistant_usage_events
  (id, session_id, timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
VALUES
  ('ev1', 'cop-s1', '2026-09-11T14:00:20.000Z', 'gpt-5-codex', 1200, 300, 1000, 50),
  -- The cache columns are empty: Copilot reported no cache bucket for this request.
  ('ev2', 'cop-s1', '2026-09-11T14:01:20.000Z', 'claude-fable-5-1', 80, 20, NULL, NULL),
  -- A request Copilot did not bill for: no tokens, so no row.
  ('ev3', 'cop-s1', '2026-09-11T14:02:20.000Z', 'gpt-5-codex', 0, 0, 0, 0);
