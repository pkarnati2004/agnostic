# Setup

agnostic doesn't ship any agent. Install and log in to the ones you want, then run `agn doctor` to confirm it sees them. Links go to each project's own install docs, which change faster than this page.

## Prerequisites

- **Node 22+** - https://nodejs.org
- **git 2.40+**
- **tmux** - `brew install tmux` (macOS) / `apt install tmux` (Linux). Sessions run inside tmux so you can attach from any terminal.
- **gh** (optional, for PR creation) - https://cli.github.com

## Agents

| Agent | Install and login | Billing agnostic uses |
|---|---|---|
| **Claude Code** | https://code.claude.com/docs - `npm i -g @anthropic-ai/claude-code`, then `claude` and sign in with your Claude Pro/Max/Team account | Your Claude plan |
| **Codex CLI** | https://github.com/openai/codex - `npm i -g @openai/codex`, then `codex` and sign in with ChatGPT | Your ChatGPT plan |
| **Pi** | https://pi.dev/docs/latest/quickstart - `npm i -g @earendil-works/pi-coding-agent`, then `/login` | API keys or subscription per Pi's docs |
| **OpenCode** | https://opencode.ai/docs - install, then configure providers | API keys |
| **Gemini CLI, Cursor Agent, Copilot CLI, Aider, Goose, Amp, Kimi CLI, Qwen Code, …** | Each project's docs | Launch/attach only in agnostic |

After installing, run:

```bash
agn doctor
```

You should see each agent with its version, login state, and tier. "Unknown" means agnostic couldn't verify login - start the agent once by hand and re-run.

## Register a repo

```bash
cd ~/code/my-repo
agn add .
agn init        # creates .ag/instructions.md from an existing CLAUDE.md/AGENTS.md if present
agn sync        # writes CLAUDE.md, AGENTS.md, and OpenCode config from .ag/instructions.md
```

## Editors for `agn open`

Detected automatically if installed: VS Code (`code`), Cursor (`cursor`), Zed (`zed`), JetBrains Toolbox IDEs, Xcode, and your terminal. Set a default in `~/.agnostic/config.yaml`.
