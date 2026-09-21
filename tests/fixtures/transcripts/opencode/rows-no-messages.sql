-- An OpenCode that keeps neither `message` nor `session_message`, and no totals on the session
-- either: a session row and nothing to bill against it.
INSERT INTO session (id, time_created, time_updated, directory, title)
VALUES ('ses_empty', 1788000000000, 1788000005000, '/work/repo', 'a task');
