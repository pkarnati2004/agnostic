# @agnostic/ledger

The daemon's store: one SQLite file at `~/.agnostic/agnostic.db`, opened in WAL mode, migrated on
open, and read through typed query functions for repos, tasks, events, usage and outcomes.

- Every row change writes its event in the same transaction, so the event stream and the rows can
  never disagree. `ledger.transaction` lets a caller put several of those in one atomic step.
- Rows are a boundary: every read is parsed with the matching `@agnostic/core` schema, and a row
  that does not match is a `LedgerError`, not a silently wrong object.
- Schema changes are numbered migrations under `src/migrations`; `schema_version` records what ran.

It is not: HTTP, business rules, transcripts, worktrees, or a place for policy. It holds no opinion
about what a task means - the daemon decides that and writes the result here.
