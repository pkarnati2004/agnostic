# @agnostic/core

The types every other package shares, and the two things they all need to do safely.

- The `.ag`-independent domain types - `Repo`, `Profile`, `Task`, `Event`, `Outcome`, `Recommendation` - each with a zod schema used at boundaries (HTTP, files, SQLite rows) and a `type` used everywhere else.
- `CoreError`, the base for every typed error in the repo, and `ProcessError`.
- `executor.ts`: the `ExecutorProvider` interface and the types either side of it (`PrepareInput`, `LaunchCommand`, `SessionHandle`, `SessionEvent`, `ProcessMatcher`, `TerminalSize`, `TerminalStream`), so the daemon and the executor share them without either importing the other. `PrepareInput.branch` is how a resume rebuilds a cleaned worktree on the branch the task ran on.
- `newId` and the id alphabet; `agnosticPaths` and the `~/.agnostic` layout.
- `launch-prompt.ts`: the pure composer that turns a task, its note and the ledger's repo state into
  the prompt a harness is launched with. Rows in, markdown out; it reads no file.
- `run` and `spawn` in `process.ts`: the only place in agnostic that starts a child process, so env scrubbing happens once.
- `daemon-api.ts` and `daemon-client.ts`: the daemon's request and response types with their zod
  schemas, and the fetch client the CLI and tools use to talk to it, including the SSE reader and
  the readers for `auth-token` and `daemon.json`. `terminal-frames.ts` is the same for the one
  route that is not fetch: the frames and the token subprotocol of `WS /tasks/:id/terminal`.
- The `.ag/` loader - `RepoConfig`, `Preferences`, `McpConfig`, the instructions and decisions text, and task notes - in the on-disk formats every other package parses.
- `marked-block.ts`: the text rule for a block agn owns inside a file the user owns, used by the hook installers and by the Codex MCP block.

It is not: storage, HTTP, the `CLAUDE.md` files `agn sync` generates, or anything that knows a specific harness. `core` imports no other package.
