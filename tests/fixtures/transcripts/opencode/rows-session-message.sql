-- The older table name, with the same JSON in `data` and no role column to filter on.
CREATE TABLE session_message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER,
  data TEXT NOT NULL
);

INSERT INTO session (id, time_created, time_updated, directory, title)
VALUES ('ses_old', 1788000000000, 1788000005000, '/work/old', 'an older task');

INSERT INTO session_message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_old', 'ses_old', 1788000001000, NULL,
  '{"role":"assistant","sessionID":"ses_old","providerID":"anthropic","modelID":"claude-fable-5-1","tokens":{"input":500,"output":100,"cache":{"read":400}},"time":{"created":1788000001000,"completed":1788000002000}}'
);
