# Setup

agnostic doesn't ship any agent. Install and log in to the ones you want, then run `agn doctor` to confirm it sees them. Links go to each project's own install docs, which change faster than this page.

## Prerequisites

- **Node 22+** - https://nodejs.org
- **git 2.40+**
- **tmux 3.2 or newer** - `brew install tmux` (macOS) / `apt install tmux` (Linux). Sessions run inside tmux on a private server (`tmux -L agn ls` lists them) so you can attach from any terminal.
- **gh** (optional, for PR creation) - https://cli.github.com

## agn itself

Until there is a published package, agn runs from a checkout:

```bash
git clone <this repo> && cd agnostic
pnpm install
pnpm agn doctor          # runs the CLI from source, arguments and flags as usual
```

To put `agn` on your PATH instead, run `pnpm build`, then `npm link` inside `packages/cli`.

## Agents

| Agent | Install and login | Billing agnostic uses |
|---|---|---|
| **Claude Code** | https://code.claude.com/docs - `npm i -g @anthropic-ai/claude-code`, then `claude` and sign in with your Claude Pro/Max/Team account | Your Claude plan |
| **Codex CLI** | https://github.com/openai/codex - `npm i -g @openai/codex`, then `codex` and sign in with ChatGPT | Your ChatGPT plan |
| **Pi** | https://pi.dev/docs/latest/quickstart - `npm i -g @earendil-works/pi-coding-agent`, then `/login` | API keys or subscription per Pi's docs |
| **OpenCode** | https://opencode.ai/docs - `npm i -g opencode-ai`, then configure providers | API keys |
| **OMP** | The project's docs | API keys per OMP's docs; agn counts tokens from its session files |
| **Gemini CLI, Cursor Agent, Copilot CLI, Kimi CLI, Factory Droid, Devin CLI, Grok CLI, Mimo Code, OpenClaude, Command Code** | Each project's docs | Status only: agn installs a hook and shows the session, and counts no tokens |
| **Aider, Goose, Amp, Qwen Code, Kiro, Crush, …** | Each project's docs | Launch and attach only in agnostic |

agn installs each agent's hook in the directory that agent reads by default, under your home.
Moving an agent's config with `GROK_HOME`, `COPILOT_HOME`, `KIMI_CODE_HOME`, `XDG_CONFIG_HOME` or
`OPENCODE_CONFIG_DIR` is not supported.

Claude Code's hook is the one agn installs per repo. In that same
`.claude/settings.local.json`, agn also sets `statusLine` to a command of its own, which is how
agn captures the rate-limit percentages Claude Code sends to its status line. agn sets the same
command in `~/.claude/settings.json`, so every Claude Code session reports and not only the ones
agn starts. A status line you already had is wrapped: it runs on the same payload and keeps
drawing, and `~/.agnostic/hooks/claude-statusline-original.json` holds the entry agn replaced. Set
`hooks: {claude_statusline: repo}` to keep agn out of `~/.claude/settings.json`. One you wrote
into a repo's own `settings.local.json` is left alone. See [Limits](usage.md#limits).

Every other agent keeps its hooks in one file per user, and agn prints one line to stderr naming
the file it wrote:

| Agent | File |
|---|---|
| Gemini CLI | `~/.gemini/settings.json` |
| Factory Droid | `~/.factory/settings.json` |
| Cursor Agent | `~/.cursor/hooks.json` |
| Kimi CLI | `~/.kimi-code/config.toml` |
| Devin CLI | `~/.config/devin/config.json` |
| OpenClaude | `~/.openclaude/settings.json` |
| Command Code | `~/.commandcode/settings.json` |

Gemini and Cursor have no permission hook agn can read without answering the question for you, so a
permission prompt in either shows as running until you answer it. Devin imports `~/.claude` hooks
unless its `read_config_from` says otherwise, so a repo that also has agn's Claude Code hook reports
each Devin turn twice; agn acts on the first report and ignores the second. agn writes JSON, so a
Devin `config.json` with comments in it is refused with the entries to paste in by hand rather than
rewritten without them.

Grok CLI and GitHub Copilot CLI each read every hook file in one directory, so agn writes one
file of its own there: `~/.grok/hooks/agn.json` and `~/.copilot/hooks/agn.json`. Nothing else in
those directories is read or changed. `agn hooks install` rewrites each file whole; delete the file
to remove the hook.

Pi, OMP, OpenCode and Mimo Code have no hook config file. Each loads code at start instead, so
agn writes one file per agent: `~/.pi/agent/extensions/agn-status.ts`,
`~/.omp/agent/extensions/agn-status.ts`, `~/.config/opencode/plugins/agn-status.js` and
`~/.config/mimocode/plugins/agn-status.js`. Every one of them starts with the line
`// agn-managed: rewritten by agn hooks install; edits here are replaced`: agn replaces a file
only while that line is there, and refuses a file of the same name that you wrote. Delete the file
to remove the hook, and restart the agent - extensions and plugins load when it starts.

Codex gates hooks on a trust hash it keeps in `~/.codex/config.toml`. agn writes that hash itself, in a block marked with `# >>> agn hooks`, so status works from the first run; if Codex ever reports the hook as untrusted, run `/hooks` in Codex and approve it.

After installing, run:

```bash
agn doctor
```

You should see each agent you have installed, with its version, login state and support:

| Support | What agnostic does |
|---|---|
| `full` | Installs a hook, shows the live status, and counts tokens and cost from the agent's transcripts |
| `status` | Installs a hook and shows the live status; no token count |
| `basic` | Starts the agent and attaches to it; the task is running until the agent exits |

Agents that are not installed are named on one `not installed:` line under the table. "Unknown"
means agnostic couldn't verify login - start the agent once by hand and re-run. `agn doctor
--verbose` adds the PATH agnostic searched, which the plain command prints only when an agent you
named is missing.

## The daemon

One local daemon owns the task database, detection and the running sessions. The first `agn`
command starts it, and it keeps running after your shell exits. `agn daemon status` says whether it
is up, `agn daemon stop` ends it, and `agn daemon restart --force` replaces one that is alive but no
longer answering. `--port <n>` on `start` or `restart` overrides the port in `~/.agnostic/config.yaml`.

The daemon sees the environment of whatever started it. Export provider keys before your first `agn`
command of the session, or run `agn daemon restart` after exporting one.

## Register a repo

```bash
cd ~/code/my-repo
agn add .
agn init        # creates .ag/, seeding instructions.md from an existing CLAUDE.md or AGENTS.md
agn sync        # writes CLAUDE.md and AGENTS.md from .ag/instructions.md
```

Both generated files start with a comment saying they are generated, and both are meant to be committed: a clone without agn, and every worktree agn creates, then carries the same instructions. `agn sync --dry-run` prints what it would write without touching anything.

## GitHub (optional)

agnostic never merges for you. Creating a pull request from the workspace, or `agn pr <task>`, pushes the task branch and, if the `gh` CLI is installed and logged in (`gh auth login`), opens the PR directly and shows you the link. Without `gh`, it opens GitHub's compare page in your browser with the title filled in and the description on your clipboard. `agn doctor` shows whether `gh` is available.

agn pushes with git's own credentials and never force-pushes. A daemon started by launchd has no ssh agent, so start `agnd` from a shell that can already `git push` - one with your ssh agent or credential helper reachable - or the push fails with git's authentication message.

A task started with `agn run --base <task>` opens its pull request against that task's branch rather than the base branch, so its diff holds only its own work. GitHub retargets it when the parent's PR merges.

## Editors for `agn open`

`agn open <task>` opens the task's worktree in an editor on this machine. agn looks for the editor's
command on the PATH the daemon was started with, then for its app bundle in `/Applications`,
`~/Applications`, `~/Applications/JetBrains Toolbox` and `/System/Applications/Utilities`. Nothing is
launched to find out whether it is installed.

The ids, in the order agn prefers them: `vscode`, `cursor`, `zed`, `idea`, `webstorm`, `pycharm`,
`goland`, `rustrover`, `clion`, `phpstorm`, `rubymine`, `xcode`, `iterm`, `terminal`. `--editor` also
takes `code` for `vscode`.

```bash
agn open <task>                  # the editor from config.yaml, or the first agn detects
agn open <task> --editor zed     # this once, in Zed
```

## Configuration

`~/.agnostic/config.yaml` holds the settings for this machine. Every key is optional:

| Key | What it does |
|---|---|
| `port` | The port the daemon listens on; 7431 by default. `--port` on `agn daemon start` or `restart` wins over it. |
| `editor` | Which editor `agn open` uses, as one of the ids above. Absent means the first editor agn detects. |
| `design_tool` | Which tool a design task opens, as `claude-design` or `figma`. Absent means `claude-design`. See [docs/design-tasks.md](design-tasks.md). |
| `catalog_check` | Whether agnostic checks once a day for a newer benchmark catalog, which is its only outbound call. Absent means yes; `false` turns it off and leaves `agn catalog update` working. |
| `spec_writer` | The profile that writes specs in the new-task dialog, as a full profile id. Absent means agn picks the cheapest model your subscription already covers. |
| `hooks` | `claude_statusline`, either `user` or `repo`. `user`, the default, puts agn's status-line command in `~/.claude/settings.json`, so every Claude Code session reports its plan's rate limit. `repo` keeps agn out of that file: only the sessions agn starts report, and your own entry goes back on the next task launch or `agn hooks install`. |
| `budget` | `daily_usd` and `weekly_usd`, a ceiling in dollars over what agn priced in the calendar day and the Monday-based week: API-key and credits runs, and a run whose billing agn could not determine. Subscription and local runs never count. At 80% `agn run`, the new-task dialog and the usage bar warn; at 100% a run or handoff onto an API-key or credits profile is refused unless you pass `--ignore-budget`. Resume is never refused. |

```yaml
port: 7431
editor: cursor
design_tool: figma
catalog_check: false
spec_writer: claude-code:haiku:native
budget:
  daily_usd: 5
  weekly_usd: 20
hooks:
  claude_statusline: repo
```

An unknown key or an unknown editor id is an error, not a silent default.
