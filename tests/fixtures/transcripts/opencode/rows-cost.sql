-- The same per-message layout as `rows.sql`, with the `cost` OpenCode writes beside the tokens.
CREATE TABLE message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER,
  data TEXT NOT NULL
);

INSERT INTO session (id, time_created, time_updated, directory, title)
VALUES ('ses_cost', 1788000000000, 1788000005000, '/work/repo', 'a task');

INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_1', 'ses_cost', 1788000001000, NULL,
  '{"role":"assistant","sessionID":"ses_cost","providerID":"anthropic","modelID":"claude-fable-5-1","cost":0.42,"tokens":{"input":1200,"output":300,"cache":{"read":1000}},"time":{"created":1788000001000,"completed":1788000002000}}'
);

-- The same shape with no cost of its own: agn prices its tokens instead.
INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_2', 'ses_cost', 1788000003000, NULL,
  '{"role":"assistant","sessionID":"ses_cost","modelID":"gpt-5-4","tokens":{"input":80,"output":20},"time":{"created":1788000003000}}'
);
