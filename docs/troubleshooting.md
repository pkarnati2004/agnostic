# Troubleshooting

**`agn doctor` says an agent is "not logged in" but it is.** Start the agent once by hand in a terminal, complete any first-run prompt, then re-run `agn doctor`.

**Status stays "running" and never shows "waiting".** The agent's hook isn't installed or can't reach the daemon. Run `agn hooks install --repo <path>` and check that `agnd` is running (`agn daemon status`).

**agn's sessions live on their own tmux server.** A plain `tmux ls` does not show them, and `tmux kill-server` does not end them. Use `tmux -L agn ls` to list them and `tmux -L agn kill-server` to end all of them at once.

**`agn attach` says "task <id> has no session running".** The tmux server restarted (e.g. after reboot). The worktree and task record remain; run `agn resume <task>`. Where the agent supports it, the conversation is restored; otherwise the agent restarts in the same worktree with the task's context.

**A second `agn run` in a folder says "folder workspaces run one task at a time".** A folder workspace has one working tree, so agn runs one task in it at a time. Stop the running task (`agn stop <task>`), or run `git init` in the folder: from the next `agn run` on, tasks get their own worktrees and branches and run in parallel.

**`agn clean` says the task is still running.** Clean removes a task's worktree, so the agent has to be out of it first. `agn stop <task>`, then clean. The branch survives either way unless you pass `--delete-branch`.

**A model override isn't offered.** The provider key isn't in the environment the daemon was started from. Restart the daemon (`agn daemon restart`) after exporting the key.

**The daemon won't start.** Port in use or a stale `daemon.json` in `~/.agnostic/`. `agn daemon restart --force`. When a start fails, agn names the log file to read; the reason is in its last lines.

**A command fails with "the agn daemon could not be started".** Every command except `agn daemon status` and `agn daemon stop` starts the daemon itself, so this means the start failed rather than that you forgot one. Check `~/.agnostic/logs/agnd.log`, then `agn daemon start` to see the error directly.

**You want to script agn.** `--json` prints the daemon's response body instead of a table, on `agn add`, `agn repos`, `agn doctor`, `agn profiles`, `agn run`, `agn status`, `agn stop` and `agn clean`; on `agn attach` it prints the tmux command instead of running it. Exit codes: 0 ok, 1 the command failed, 2 the command line was wrong.

**Where things live.** Task database `~/.agnostic/agnostic.db`; worktrees `~/.agnostic/worktrees/<repo>/<task>`; the daemon log `~/.agnostic/logs/agnd.log`.

**Reading the daemon log.** `tail -f ~/.agnostic/logs/agnd.log`. One line per request, with the method, path, status and duration. Prompts, task titles and your auth token are never written there.
