# @agnostic/sync

`.ag/instructions.md` is the one instructions file a user maintains. This package plans what that
means on disk: which files `agn init` creates, and what `agn sync` renders from `instructions.md`.

- `planInit` and `planSync` are pure: file contents in, a list of writes out. The file layers
  (`init-files.ts`, `sync-files.ts`) only read and write what a plan names.
- The target table is two rows (ADR 017): `AGENTS.md` carries the generated text, `CLAUDE.md` is
  the generated header plus Claude Code's own `@AGENTS.md` import.
- The header on line 1 is what marks a file as agn's. A target without it is overwritten only when
  it already holds what sync would write below it; otherwise the plan says `conflict`.

It is not: HTTP, the ledger, git, or anything harness-specific beyond the target table. Deciding
when to sync, and turning a refusal into a status code, is the daemon's job.
