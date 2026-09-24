# agnostic

**One workspace above every coding agent.**

Agent-agnostic development. Use Claude Code, Codex, Pi - and know which one to use. Models will change; where you work shouldn't.

`agnostic` is a local-first workspace for the coding agents you already have. It recommends which agent and model to use for each task, runs the task in an isolated git worktree using that agent's own CLI, and lets you watch and jump into every running agent across all your repos from one window.

- **Bring your own agent / subscription.** Claude Code, Codex, Pi, OpenCode, Kimi, local models - anything with a CLI. Your logins, your keys, your plans. Nothing is proxied.
- **Recommendations, not leaderboards.** Describe the task; get a pick with a reason, a confidence label, and the benchmarks behind it - limited to agents you can actually run.
- **Isolation.** One worktree per task. No stepping on each other's changes.
- **Native sessions.** Plan mode, tool approvals, permissions, subagents all happen in the agent's own UI. `agnostic` renders it; it doesn't replace it.
- **Portable project context.** `.ag/instructions.md` is the one file you maintain; `agn sync` generates `CLAUDE.md` and `AGENTS.md` from it. Claude Code reads CLAUDE.md; Codex, OpenCode and Pi read AGENTS.md.
- **Open anywhere.** VS Code, Cursor, Zed, JetBrains, Xcode, or a terminal - one click.
- **Workflows (optional).** Declare roles (plan, implement, test, review) once; agnostic generates each agent's native subagent config with the right model per role. Off unless you turn it on. *(soon)*
- **Usage and cost.** Per-task tokens and cost, per-plan usage at a glance.
- **Local. Free. MIT.** No server, no account, no telemetry. agnostic makes one outbound call: a
  daily check for a newer benchmark catalog. Put `catalog_check: false` in `~/.agnostic/config.yaml`
  to turn it off; `agn catalog update` still works when you ask for it.

## How it works

1. **Start with the work.** `agn run "add invitation links"` - or press **+ Task** in the workspace. agnostic creates a worktree and a branch.
2. **Pick the best agent, or let us.** The recommendation card shows the pick, an alternative, and something worth trying if you don't have it yet.
3. **Review and merge.** Watch the session, jump in when it asks, open the diff in your editor, merge when you're ready.

## Install

```bash
npm i -g agnostic-dev        # installs the `agn` command
agn doctor                   # shows which agents you have and whether they're logged in
agn add ~/code/my-repo       # register a repo
agn ui                       # open the workspace
```

Requirements: macOS (Linux best-effort), Node 22+, git, tmux, and at least one coding agent CLI installed and logged in. See [docs/setup](docs/setup.md) for per-agent instructions.

## Commands

| Command | What it does |
|---|---|
| `agn daemon start\|stop\|status\|restart` | Run, inspect or replace the background daemon. `--port <n>` on `start` and `restart`, `--force` on `restart` |
| `agn add <path>` | Register a repo. `--git-init` runs `git init` on a plain folder first; `--new-id` registers a second clone |
| `agn repos` | List the registered repos and mark a repo whose folder is missing. `--all` includes closed ones and names each one's status |
| `agn repo close\|open\|remove <repo>` | Close a repo so it leaves the list and the workspace, keeping its history, or open it again. `remove` hides a repo for good and deletes the worktrees agn made for its tasks, keeping its history; `agn add <path>` brings it back. Close and remove are refused while a task is running or waiting |
| `agn doctor` | Detect installed agents, logins, provider keys, local model servers |
| `agn profiles` | List the agent × model combinations you can run right now |
| `agn run "<task>"` | Create a worktree and start an agent. `--profile <id>`, `--harness other:<binary>`, `--model <m>`, `--repo <r>`, `--title <t>`, `--base <ref\|task>`, `--intent <class>`, `--skip-tests`, `--ignore-budget`. `--intent design` starts a design task instead of an agent, see [docs/design-tasks.md](docs/design-tasks.md) |
| `agn status [<task>]` | One task, or every task across your repos. `--all` lists everything from inside a worktree |
| `agn attach [<task>]` | Join the session in your terminal; defaults to the task of the worktree you are in |
| `agn stop <task>` | Stop the session |
| `agn clean [<task>...]` | Remove the worktrees of closed tasks. `--delete-branch` removes the branch too; `--force` removes a worktree that still holds uncommitted work |
| `agn resume [<task>]` | Bring a session back after a reboot, with its history where the agent supports it |
| `agn adopt <path>` | Register an agent session you started outside agn. `--task "<title>"`, `--pid <n>`, `--repo <r>` |
| `agn hooks install` | Install the status hook in a repo. `--repo <r>`, `--harness <id>` |
| `agn hooks uninstall` | Remove the status hook and the status line again. `--repo <r>`, `--harness <id>` |
| `agn init` | Create `.ag/`, seeding `instructions.md` from an existing `CLAUDE.md` or `AGENTS.md`. `--from <file>`, `--force`, `--repo <r>` |
| `agn sync` | Regenerate `CLAUDE.md` and `AGENTS.md` from `.ag/instructions.md`, and the MCP servers of `.ag/mcp.yaml` into each agent's own config. `--dry-run`, `--force`, `--repo <r>` |
| `agn recommend "<task>"` | Recommend a profile, with reasons and sources. `--repo <r>`, `--intent <class>`, `--subscriptions-only` |
| `agn handoff [<task>] --to <id\|harness>` | Stop a task and hand its work to another agent with a structured note. `--note <text>` (`-` reads stdin), `--note-file <path>` |
| `agn usage [<task>]` | Today's and this week's usage per plan, or one task's |
| `agn outcomes <task>` | What the task changed, what passed, what you kept |
| `agn changes [<task>]` | Files the task changed against its base, with counts. `--patch <path>` prints one file's diff |
| `agn pr [<task>]` | Push the branch and open its pull request. `--title <t>`, `--no-open` |
| `agn update [<task>]` | Ask the agent to bring the branch up to date with its base: rebase if never pushed, merge if pushed |
| `agn compare "<prompt>"` | Run one prompt on 2-4 profiles at once, one worktree each. `--profiles a,b`; omitted, agn's pick and its alternative |
| `agn compare show <id>` | One table over the agents: files, lines, tests, cost, time |
| `agn compare pick <id> <task>` | Keep one; the others are stopped and their worktrees removed, branches kept |
| `agn open [<task>]` | Open the task's directory in your editor. `--editor <id>`; `--tool` opens a design task's design tool |
| `agn catalog show <profile>` / `agn catalog update` | Print the benchmark rows behind a recommendation, or fetch the latest catalog |
| `agn mcp` | Serve agn's commands to an agent over MCP on stdin and stdout; see [docs/mcp.md](docs/mcp.md) |
| `agn ui` | Open the workspace in your browser. `--no-open` prints the address instead |

Every command prints plain text: one aligned table for a list, `key: value` lines for a single
thing, no colours. `--json` prints the daemon's response body instead, so scripts read the same
types the UI does. Errors go to stderr as `agn: <message>` with an indented hint. Exit codes are 0
for ok, 1 for a command that failed and 2 for a command line that was wrong; `agn daemon status`
answers with its code instead (0 running, 1 stopped, 2 stale).

Any command starts the daemon if it is not already running, except `agn daemon status` and
`agn daemon stop`. `AGNOSTIC_HOME` moves everything agn stores away from `~/.agnostic`.

## Supported agents

Full support (status, usage, recommendations): **Claude Code, Codex, Pi, OpenCode.**
Status hook, no token count: Gemini CLI, Cursor Agent, Kimi CLI, Factory Droid, Devin CLI, OpenClaude, Command Code (see [docs/setup.md](docs/setup.md)).
Launch and attach: any other CLI agent - Copilot CLI, Aider, Goose, Amp, Qwen Code, and more.

Model overrides (Kimi in Claude Code, a local model in Codex, anything via OpenRouter) go through each agent's own mechanism with your own keys. See [docs/models](docs/models.md).

## Documentation

- [Setup: installing and logging into agents](docs/setup.md)
- [Models and providers: OpenRouter, Kimi, local models](docs/models.md)
- [Project context: `.ag/` and `agn sync`](docs/project-context.md)
- [Design tasks: a task you do in a design tool](docs/design-tasks.md)
- [Recommendations: how the catalog works](docs/recommendations.md)
- [Usage and cost: what agn counts](docs/usage.md)
- [Catalog: what it holds, how it updates](docs/catalog.md)
- [Workspace UI](docs/workspace.md)
- [MCP: agn's commands as tools for an agent](docs/mcp.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Writing guide for docs and site](docs/WRITING.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Code is MIT; borrowed pieces are listed in [PROVENANCE.md](PROVENANCE.md).
