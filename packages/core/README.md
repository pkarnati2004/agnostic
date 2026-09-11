# @agnostic/core

The types every other package shares, and the two things they all need to do safely.

- The `.ag`-independent domain types - `Repo`, `Profile`, `Task`, `Event`, `Outcome`, `Recommendation` - each with a zod schema used at boundaries (HTTP, files, SQLite rows) and a `type` used everywhere else.
- `CoreError`, the base for every typed error in the repo, and `ProcessError`.
- `newId` and the id alphabet; `agnosticPaths` and the `~/.agnostic` layout.
- `run` and `spawn` in `process.ts`: the only place in agnostic that starts a child process, so env scrubbing happens once.
- `daemon-api.ts` and `daemon-client.ts`: the daemon's request and response types with their zod
  schemas, and the fetch client the CLI and tools use to talk to it, including the SSE reader and
  the readers for `auth-token` and `daemon.json`.
- The `.ag/` loader - `RepoConfig`, `Preferences`, the instructions and decisions text, and task notes - in the on-disk formats every other package parses.

It is not: storage, HTTP, the `CLAUDE.md` files `agn sync` generates, or anything that knows a specific harness. `core` imports no other package.
