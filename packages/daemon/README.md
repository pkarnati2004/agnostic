# @agnostic/daemon

The one process in agnostic that holds state: a Hono app on `127.0.0.1` behind a bearer token,
the ledger, and the detection it caches for the life of the process.

- `agnd run` serves in the foreground. `agnd start|stop|status|restart` manage a detached copy and
  record it in `~/.agnostic/daemon.json`, which is a hint every reader verifies (ADR 005).
- Typed errors from core, the ledger and the registry become HTTP status here, in `error.ts`, and
  nowhere else. Every request body and query is parsed with a core schema at its route.
- `GET /events` is the SSE feed over the ledger's event table; `Last-Event-ID` resumes it.
- Detection runs at start and on `POST /doctor`; `GET /profiles` answers from that cache.
- Tasks: `POST /repos/:id/tasks` resolves the profile, writes the queued row and its note, prepares
  the worktree and launches the harness through the executor. Statuses follow the session's exit,
  and liveness is reconciled at start and before every task read, never on a timer.
- `POST /tasks/:id/resume` walks the resume tree (live session, recorded session id, fresh with the
  task context); `GET /repos/:id/sessions` and `POST /repos/:id/adopt` take over a session someone
  started outside agn.
- `POST /repos/:id/init` creates `.ag/`; `POST /repos/:id/sync` renders `CLAUDE.md` and `AGENTS.md`
  from it, or plans the render for a dry run. Every launch syncs the directory it is about to start
  an agent in, and logs the refusal rather than failing the run.
- Every task that closes gets an outcome row: its live time, tokens, cost, model, the repo's
  `test_command` before launch and after close, and the lines its branch changed. A sweep at start
  and every five minutes reads git for the verdict, and `GET /tasks/:id/outcome` rechecks one task
  before answering.
- The log is `~/.agnostic/logs/agnd.log`: one line per request, with method, path, status and
  duration. No prompt, task title or token ever reaches it.

It is not: task execution, tmux, hooks, or any rendering - and it is the only package that imports
core, ledger and registry together.
