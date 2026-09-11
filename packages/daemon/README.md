# @agnostic/daemon

The one process in agnostic that holds state: a Hono app on `127.0.0.1` behind a bearer token,
the ledger, and the detection it caches for the life of the process.

- `agnd run` serves in the foreground. `agnd start|stop|status|restart` manage a detached copy and
  record it in `~/.agnostic/daemon.json`, which is a hint every reader verifies (ADR 005).
- Typed errors from core, the ledger and the registry become HTTP status here, in `error.ts`, and
  nowhere else. Every request body and query is parsed with a core schema at its route.
- `GET /events` is the SSE feed over the ledger's event table; `Last-Event-ID` resumes it.
- Detection runs at start and on `POST /doctor`; `GET /profiles` answers from that cache.
- The log is `~/.agnostic/logs/agnd.log`: one line per request, with method, path, status and
  duration. No prompt, task title or token ever reaches it.

It is not: task execution, tmux, hooks, or any rendering - and it is the only package that imports
core, ledger and registry together.
