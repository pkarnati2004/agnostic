-- One assistant message per turn in `message`: what a current OpenCode writes.
CREATE TABLE message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  time_created INTEGER NOT NULL,
  time_updated INTEGER,
  data TEXT NOT NULL
);

INSERT INTO session (id, time_created, time_updated, directory, title)
VALUES ('ses_root', 1788000000000, 1788000005000, '/work/repo', 'a task');

INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_1', 'ses_root', 1788000001000, NULL,
  '{"role":"assistant","sessionID":"ses_root","providerID":"anthropic","modelID":"claude-fable-5-1","tokens":{"input":1200,"output":300,"reasoning":100,"cache":{"read":1000,"write":50}},"time":{"created":1788000001000,"completed":1788000002000}}'
);

-- A user message: no usage of its own, and not a turn.
INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_2', 'ses_root', 1788000003000, NULL,
  '{"role":"user","sessionID":"ses_root","time":{"created":1788000003000}}'
);

-- Seconds rather than milliseconds, and its own working directory.
INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_3', 'ses_root', 1788000004000, NULL,
  '{"role":"assistant","sessionID":"ses_root","providerID":"openai","modelID":"gpt-5-4","path":{"cwd":"/work/other"},"tokens":{"input":80,"output":20,"cache":{"read":0}},"time":{"created":1788000004,"completed":1788000004}}'
);

-- An answer that cost nothing: no bucket, so no row.
INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (
  'msg_4', 'ses_root', 1788000005000, NULL,
  '{"role":"assistant","sessionID":"ses_root","modelID":"gpt-5-4","tokens":{"input":0,"output":0},"time":{"created":1788000005000}}'
);
