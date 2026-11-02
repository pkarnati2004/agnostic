# agnostic-dev

The `agn` command: argument parsing and rendering over the daemon's HTTP API. Every command turns
argv into one client call and prints the answer as an aligned table, `key: value` lines, or - with
`--json` - the daemon's response body verbatim.

- It connects through `@agnostic/core`'s `DaemonClient`, and starts the daemon first when nothing is
  listening (`agn daemon status` and `agn daemon stop` are the exceptions).
- `agn daemon <cmd>` runs the daemon package's own entry as a child process and forwards its exit
  code, so the CLI never loads the daemon, the registry or SQLite.
- `agn init` and `agn sync` render the daemon's plan: one line per file, and on `--dry-run` the
  text each file would get, indented.
- Exit codes: 0 ok, 1 the command failed, 2 the command line was wrong.

It is not: state, detection, launching, or policy. It holds no opinion the daemon does not already
hold, and it imports no workspace package other than `@agnostic/core`.

Published to npm as `agnostic-dev`: `scripts/pack-npm.ts` bundles this package, the daemon and the workspace page into one tarball with `better-sqlite3` and `node-pty` as its dependencies; `pnpm smoke:npm` installs that tarball into a temporary prefix and runs it. See `docs/release.md`.
