# Troubleshooting

**`agn doctor` says an agent is "not logged in" but it is.** Start the agent once by hand in a terminal, complete any first-run prompt, then re-run `agn doctor`.

**Status stays "running" and never shows "waiting".** The agent's hook isn't installed or can't reach the daemon. Run `agn hooks install --repo <path>` and check that `agnd` is running (`agn daemon status`).

**agn's sessions live on their own tmux server.** A plain `tmux ls` does not show them, and `tmux kill-server` does not end them. Use `tmux -L agn ls` to list them and `tmux -L agn kill-server` to end all of them at once.

**`agn attach` says the session doesn't exist.** The tmux server restarted (e.g. after reboot). The worktree and task record remain; run `agn resume <task>`. Where the agent supports it, the conversation is restored; otherwise the agent restarts in the same worktree with the task's context.

**A model override isn't offered.** The provider key isn't in the environment the daemon was started from. Restart the daemon (`agn daemon restart`) after exporting the key.

**The daemon won't start.** Port in use or a stale `daemon.json` in `~/.agnostic/`. `agn daemon restart --force`. When a start fails, agn names the log file to read; the reason is in its last lines.

**A command fails with "the agn daemon could not be started".** Every command except `agn daemon status` and `agn daemon stop` starts the daemon itself, so this means the start failed rather than that you forgot one. Check `~/.agnostic/logs/agnd.log`, then `agn daemon start` to see the error directly.

**You want to script agn.** `--json` prints the daemon's response body instead of a table, on `agn add`, `agn repos`, `agn doctor` and `agn profiles`. Exit codes: 0 ok, 1 the command failed, 2 the command line was wrong.

**Where things live.** Task database `~/.agnostic/agnostic.db`; worktrees `~/.agnostic/worktrees/<repo>/<task>`; the daemon log `~/.agnostic/logs/agnd.log`.

**Reading the daemon log.** `tail -f ~/.agnostic/logs/agnd.log`. One line per request, with the method, path, status and duration. Prompts, task titles and your auth token are never written there.
