# @agnostic/hooks

Status hooks for the harnesses that have them. Two things live here: an installer per harness,
which writes agn's hook command into that harness's own hook config, and a parser per harness,
which turns one hook payload into `running`, `waiting`, or nothing at all.

- One machine-local script (`~/.agnostic/hooks/post.sh`) is the hook command for every harness. It
  reads the daemon's port and token at run time, so no config file ever carries a token.
- The registry says which file each harness keeps its hooks in; this package says which events go
  in it, how they are written, and what each one means.
- `settings-json/` is the family that reads a Claude-shaped config: a member is one file holding
  its events, its layout and its status table. Claude Code installs per repo
  (`.claude/settings.local.json` plus a `.git/info/exclude` entry); every other member installs per
  user. Codex and Kimi own a marked block in a TOML config instead of a JSON file.
- `harness-hooks.ts` is the table: a new harness is one member file and two rows.

It is not: HTTP, the ledger, or status policy beyond the two statuses a hook can mean. Deciding
which task an event belongs to, and writing it down, is the daemon's job.
