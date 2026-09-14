# @agnostic/hooks

Status hooks for the harnesses that have them. Two things live here: an installer per harness,
which writes agn's hook command into that harness's own hook config, and a parser per harness,
which turns one hook payload into `running`, `waiting`, or nothing at all.

- One machine-local script (`~/.agnostic/hooks/post.sh`) is the hook command for every harness. It
  reads the daemon's port and token at run time, so no config file ever carries a token.
- Claude Code installs per repo (`.claude/settings.local.json` plus a `.git/info/exclude` entry);
  Codex has no per-repo hook file, so it installs per user, in a marked block of its config.
- `harness-hooks.ts` is the table: a new harness is one `install.ts`, one `parse.ts`, two rows.

It is not: HTTP, the ledger, or status policy beyond the two statuses a hook can mean. Deciding
which task an event belongs to, and writing it down, is the daemon's job.
