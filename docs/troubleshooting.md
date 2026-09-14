# Troubleshooting

**`agn doctor` says an agent is "not logged in" but it is.** Start the agent once by hand in a terminal, complete any first-run prompt, then re-run `agn doctor`.

**Status stays "running" and never shows "waiting".** The agent's hook isn't installed or can't reach the daemon. Run `agn hooks install --repo <path>` and check that `agnd` is running (`agn daemon status`). Agents with basic support in `agn doctor` have no hook at all: they are running until they exit.

**Where the hooks live.** One script, `~/.agnostic/hooks/post.sh`, is the hook command for every agent; it reads the daemon's port and token when it runs, so a restarted daemon needs no reinstall and no config file holds a token. Claude Code's hook goes in `<repo>/.claude/settings.local.json` (and in the task's worktree), with the path added to `.git/info/exclude` unless git already ignores it. Codex has no per-repo hook file, so its hook goes in `~/.codex/hooks.json` with a marked block of trust entries in `~/.codex/config.toml`; agn prints one line to stderr when it writes either of those.

**Codex says the agn hook is untrusted.** Codex runs a hook only when `~/.codex/config.toml` holds the hash of that exact hook. Run `/hooks` in Codex and approve it, or run `agn hooks install --repo <path>` again to rewrite the entry. If agn refuses to edit the file, the block it manages has been split or one of its entries exists outside it: remove the `[hooks.state."…post.sh…"]` tables and the `# >>> agn hooks` markers, then install again.

**agn's sessions live on their own tmux server.** A plain `tmux ls` does not show them, and `tmux kill-server` does not end them. Use `tmux -L agn ls` to list them and `tmux -L agn kill-server` to end all of them at once.

**`agn attach` says "task <id> has no session running".** The tmux server restarted (e.g. after reboot). The worktree and task record remain; run `agn resume <task>`. Where the agent supports it, the conversation is restored; otherwise the agent restarts in the same worktree with the task's context.

**`agn attach` says the session "was started outside tmux".** The task was adopted from an agent running in a plain terminal, and agn cannot put that process in another terminal. Work in the terminal it is already in; when it exits, `agn resume <task>` starts the agent again in the same directory, under agn's tmux this time.

**`agn resume` says the worktree "has been cleaned".** The worktree is gone but the branch is not. Continue the work in a new task from that branch: `agn run "<prompt>" --base <task>`.

**`agn resume` says history was not recoverable.** Only agents that report a session id can reopen a conversation, and only if one was captured before the session ended. The agent restarts in the same directory with the task's spec, recent repo state and decisions as its first prompt; the transcript of the old run is not lost, it is just not reloaded.

**`agn adopt` lists several agents.** More than one agent is running under that path, and agn does not pick for you. Run it again with the pid from the first column: `agn adopt <path> --pid <n>`. If the pid you pass is no longer listed, the process has exited or is not an agent agn knows.

**`agn adopt` says the path is not inside the repo.** Adopt registers a session in a repo you have already added. Pass a path inside that repo, or `--repo <id or path>` to say which repo it belongs to.

**A second `agn run` in a folder says "folder workspaces run one task at a time".** A folder workspace has one working tree, so agn runs one task in it at a time. Stop the running task (`agn stop <task>`), or run `git init` in the folder: from the next `agn run` on, tasks get their own worktrees and branches and run in parallel.

**`agn handoff` says the branch "no longer exists".** The task you are handing off was cleaned with `--delete-branch`, so there are no commits for the next agent to continue from. Start the work again with `agn run "<prompt>"`. A task whose worktree was cleaned but whose branch was kept hands off normally.

**`agn clean` says the task is still running.** Clean removes a task's worktree, so the agent has to be out of it first. `agn stop <task>`, then clean. The branch survives either way unless you pass `--delete-branch`.

**`agn sync` says a file "was written by hand and agn will not overwrite that".** The file no longer starts with agn's generated header, so agn treats it as yours. Copy what you want to keep into `.ag/instructions.md`, then run `agn sync --force` to regenerate it. During `agn run` or `agn resume` the same case is not an error: the task starts on the file that is there, and the daemon log records `sync skipped`.

**Something you added to CLAUDE.md or AGENTS.md disappeared.** The header means agn owns the whole file, so an edit below an intact header is overwritten on the next sync with no conflict and no warning. Add the text to `.ag/instructions.md` and run `agn sync`; `git diff` on the generated file shows what was lost.

**`agn init` says CLAUDE.md and AGENTS.md "are both here and they differ".** agn will not guess which one your instructions live in, and it never concatenates them. Run `agn init --from CLAUDE.md` or `agn init --from AGENTS.md`.

**`agn usage` shows less than the agent's own usage screen.** They count different windows. agn counts the calendar day and the week from Monday, in your time zone; Claude Code and Codex show their plan's rolling window (five hours, seven days). agn also reads only what is in the transcript files on this machine, so a session run on another machine under the same login is not there.

**`agn usage` shows a `-` in the cost column.** Either the model runs on your subscription, where the tokens cost nothing extra, or agn has no price for the model the agent reported. Run `agn catalog update` to refresh the rates. Usage from a session agn did not start is never priced.

**A model override isn't offered.** The provider key isn't in the environment the daemon was started from. Restart the daemon (`agn daemon restart`) after exporting the key.

**The daemon won't start.** Port in use or a stale `daemon.json` in `~/.agnostic/`. `agn daemon restart --force`. When a start fails, agn names the log file to read; the reason is in its last lines. If another `AGNOSTIC_HOME` already has a daemon on that port, `agn daemon status` says `foreign` and `--force` refuses and names the other home rather than killing it: stop that daemon where it lives, or start this one with `--port`.

**A command fails with "the agn daemon could not be started".** Every command except `agn daemon status` and `agn daemon stop` starts the daemon itself, so this means the start failed rather than that you forgot one. Check `~/.agnostic/logs/agnd.log`, then `agn daemon start` to see the error directly.

**You want to script agn.** `--json` prints the daemon's response body instead of a table, on `agn add`, `agn repos`, `agn doctor`, `agn profiles`, `agn run`, `agn status`, `agn stop`, `agn clean`, `agn handoff`, `agn adopt`, `agn hooks install`, `agn init` and `agn sync`; on `agn attach` and `agn resume` it prints the tmux command instead of running it. Exit codes: 0 ok, 1 the command failed, 2 the command line was wrong.

**Where things live.** Task database `~/.agnostic/agnostic.db`; worktrees `~/.agnostic/worktrees/<repo>/<task>`; the daemon log `~/.agnostic/logs/agnd.log`.

**Reading the daemon log.** `tail -f ~/.agnostic/logs/agnd.log`. One line per request, with the method, path, status and duration. Prompts, task titles and your auth token are never written there.
