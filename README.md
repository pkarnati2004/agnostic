# agnostic

**One workspace above every coding agent.**

Agent-agnostic development. Use Claude Code, Codex, Pi - and know which one to use. Models will change; where you work shouldn't.

`agnostic` is a local-first workspace for the coding agents you already have. It recommends which agent and model to use for each task, runs the task in an isolated git worktree using that agent's own CLI, and lets you watch and jump into every running agent across all your repos from one window.

- **Bring your own agent / subscription.** Claude Code, Codex, Pi, OpenCode, Kimi, local models - anything with a CLI. Your logins, your keys, your plans. Nothing is proxied.
- **Recommendations, not leaderboards.** Describe the task; get a pick with a reason, a confidence label, and the benchmarks behind it - limited to agents you can actually run.
- **Isolation.** One worktree per task. No stepping on each other's changes.
- **Native sessions.** Plan mode, tool approvals, permissions, subagents all happen in the agent's own UI. `agnostic` renders it; it doesn't replace it.
- **Portable project context.** `.ag/instructions.md` is the one file you maintain; `agn sync` generates `CLAUDE.md`, `AGENTS.md`, and OpenCode config from it.
- **Open anywhere.** VS Code, Cursor, Zed, JetBrains, Xcode, or a terminal - one click.
- **Workflows (optional).** Declare roles (plan, implement, test, review) once; agnostic generates each agent's native subagent config with the right model per role. Off unless you turn it on. *(soon)*
- **Usage and cost.** Per-task tokens and cost, per-plan usage at a glance.
- **Local. Free. MIT.** No server, no account, no telemetry.

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
| `agn doctor` | Detect installed agents, logins, provider keys, local model servers |
| `agn profiles` | List the agent × model combinations you can run right now |
| `agn add <path>` | Register a repo |
| `agn recommend "<task>"` | Recommend a profile for the task, with reasons and sources |
| `agn run "<task>" [--profile <id>]` | Create a worktree and start the agent |
| `agn status` / `agn attach <task>` / `agn stop <task>` | Watch, join, or stop a session |
| `agn resume <task>` | Bring a session back after a reboot, with its history where the agent supports it |
| `agn adopt <path>` | Register an agent session you started outside agn |
| `agn handoff <task> --to <profile>` | Hand a task to another agent with a structured note |
| `agn sync` | Regenerate agent-specific config from `.ag/instructions.md` |
| `agn open <task> [--editor cursor]` | Open the worktree in your editor |
| `agn usage` | Today's and this week's usage per plan |
| `agn ui` | Open the workspace |

## Supported agents

Full support (status, usage, recommendations): **Claude Code, Codex, Pi, OpenCode.**
Launch and attach: any CLI agent - Gemini CLI, Cursor Agent, Copilot CLI, Aider, Goose, Amp, Kimi CLI, Qwen Code, and more.

Model overrides (Kimi in Claude Code, a local model in Codex, anything via OpenRouter) go through each agent's own mechanism with your own keys. See [docs/models](docs/models.md).

## Documentation

- [Setup: installing and logging into agents](docs/setup.md)
- [Models and providers: OpenRouter, Kimi, local models](docs/models.md)
- [Project context: `.ag/` and `agn sync`](docs/project-context.md)
- [Recommendations: how the catalog works](docs/recommendations.md)
- [Workspace UI](docs/workspace.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Writing guide for docs and site](docs/WRITING.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Code is MIT; borrowed pieces are listed in [PROVENANCE.md](PROVENANCE.md).
