# Troubleshooting

**`agn doctor` says an agent is "not logged in" but it is.** Start the agent once by hand in a terminal, complete any first-run prompt, then re-run `agn doctor`.

**Status stays "running" and never shows "waiting".** The agent's hook isn't installed or can't reach the daemon. Run `agn hooks install --repo <path>` and check that `agnd` is running (`agn daemon status`).

**`agn attach` says the session doesn't exist.** The tmux server restarted (e.g. after reboot). The worktree and task record remain; run `agn resume <task>` to start the agent again in the same worktree.

**A model override isn't offered.** The provider key isn't in the environment the daemon was started from. Restart the daemon (`agn daemon restart`) after exporting the key.

**The daemon won't start.** Port in use or a stale lock file in `~/.agnostic/`. `agn daemon restart --force`.

**Where things live.** Task database `~/.agnostic/agnostic.db`; worktrees `~/.agnostic/worktrees/<repo>/<task>`; logs `~/.agnostic/logs/`.
