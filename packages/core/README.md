# @agnostic/core

The types every other package shares, and the two things they all need to do safely.

- The `.ag`-independent domain types - `Repo`, `Profile`, `Task`, `Event`, `Outcome`, `Recommendation` - each with a zod schema used at boundaries (HTTP, files, SQLite rows) and a `type` used everywhere else.
- `CoreError`, the base for every typed error in the repo, and `ProcessError`.
- `newId` and the id alphabet; `agnosticPaths` and the `~/.agnostic` layout.
- `run` and `spawn` in `process.ts`: the only place in agnostic that starts a child process, so env scrubbing happens once.

It is not: config loading (`.ag/agnostic.yaml` is loaded in a later chunk), storage, HTTP, or anything that knows a specific harness. `core` imports no other package.
