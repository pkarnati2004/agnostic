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
| **Gemini CLI, Cursor Agent, Copilot CLI, Aider, Goose, Amp, Kimi CLI, Qwen Code, …** | Each project's docs | Launch/attach only in agnostic |

Codex gates hooks on a trust hash it keeps in `~/.codex/config.toml`. agn writes that hash itself, in a block marked with `# >>> agn hooks`, so status works from the first run; if Codex ever reports the hook as untrusted, run `/hooks` in Codex and approve it.

After installing, run:

```bash
agn doctor
```

You should see each agent with its version, login state, and tier. "Unknown" means agnostic couldn't verify login - start the agent once by hand and re-run.

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

agnostic never merges for you. Creating a pull request from the workspace pushes the task branch and, if the `gh` CLI is installed and logged in (`gh auth login`), opens the PR directly and shows you the link. Without `gh`, it opens GitHub's compare page in your browser with the title filled in and the description on your clipboard. `agn doctor` shows whether `gh` is available.

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
| `catalog_check` | Whether agnostic checks once a day for a newer benchmark catalog, which is its only outbound call. Absent means yes; `false` turns it off and leaves `agn catalog update` working. |
| `spec_writer` | The profile that writes specs in the new-task dialog, as a full profile id. Absent means agn picks the cheapest model your subscription already covers. |

```yaml
port: 7431
editor: cursor
catalog_check: false
spec_writer: claude-code:haiku:native
```

An unknown key or an unknown editor id is an error, not a silent default.
