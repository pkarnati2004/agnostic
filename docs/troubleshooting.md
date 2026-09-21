# Troubleshooting

**`agn doctor` says an agent is "not logged in" but it is.** Start the agent once by hand in a terminal, complete any first-run prompt, then re-run `agn doctor`.

**Status stays "running" and never shows "waiting".** The agent's hook isn't installed or can't reach the daemon. Run `agn hooks install --repo <path>` and check that `agnd` is running (`agn daemon status`). Agents with basic support in `agn doctor` have no hook at all: they are running until they exit.

**Where the hooks live.** One script, `~/.agnostic/hooks/post.sh`, is the hook command for every agent; it reads the daemon's port and token when it runs, so a restarted daemon needs no reinstall and no config file holds a token. Claude Code's hook goes in `<repo>/.claude/settings.local.json` (and in the task's worktree), with the path added to `.git/info/exclude` unless git already ignores it. Codex has no per-repo hook file, so its hook goes in `~/.codex/hooks.json` with a marked block of trust entries in `~/.codex/config.toml`; agn prints one line to stderr when it writes either of those.

**Codex says the agn hook is untrusted.** Codex runs a hook only when `~/.codex/config.toml` holds the hash of that exact hook. Run `/hooks` in Codex and approve it, or run `agn hooks install --repo <path>` again to rewrite the entry. If agn refuses to edit the file, the block it manages has been split or one of its entries exists outside it: remove the `[hooks.state."…post.sh…"]` tables and the `# >>> agn hooks` markers, then install again.

**`agn catalog update` says it could not fetch.** The check could not reach the published catalog: no network, a proxy in the way, or the host is down. Nothing changed - the catalog already on disk stays in use, and the version it names is in the message. Try again later, or point `AGNOSTIC_CATALOG_URL` at a mirror or a local copy of the two files. If you would rather agn never reached out on its own, put `catalog_check: false` in `~/.agnostic/config.yaml`; `agn catalog update` still works when you run it.

**The workspace says "403 origin-forbidden".** The page was opened from an address the daemon does not serve, so it refuses every request from it. Open the workspace from the URL `agn ui` prints, which is the daemon's own `http://127.0.0.1:<port>`.

**agn's sessions live on their own tmux server.** A plain `tmux ls` does not show them, and `tmux kill-server` does not end them. Use `tmux -L agn ls` to list them and `tmux -L agn kill-server` to end all of them at once.

**`agn attach` says "task <id> has no session running".** The tmux server restarted (e.g. after reboot). The worktree and task record remain; run `agn resume <task>`. Where the agent supports it, the conversation is restored; otherwise the agent restarts in the same worktree with the task's context.

**`agn attach` says the session "was started outside tmux".** The task was adopted from an agent running in a plain terminal, and agn cannot put that process in another terminal. Work in the terminal it is already in; when it exits, `agn resume <task>` starts the agent again in the same directory, under agn's tmux this time.

**`agn resume` says the branch "no longer exists".** The worktree was cleaned and the branch went with it, so there is nothing left to rebuild the task from. Start the work again: `agn run "<prompt>"`. A clean deletes the branch only when you pass `--delete-branch`.

**`agn resume` on a task you cleaned.** It rebuilds the worktree at the same path from the branch the clean kept, runs the repo's `setup_command` again because the installed dependencies went with the directory, and reopens the conversation where the agent supports it. The first line of the resume names the branch it came from.

**`agn resume` says history was not recoverable.** Only agents that report a session id can reopen a conversation, and only if one was captured before the session ended. The agent restarts in the same directory with the task's spec, recent repo state and decisions as its first prompt; the transcript of the old run is not lost, it is just not reloaded.

**`agn resume` starts fresh on a task that reopened its conversation before.** Before it hands a session id back, agn looks for the transcript file the agent names after that id. When the file is not there, the agent no longer has the conversation, and passing the id would make it exit with an error instead of starting. agn starts it fresh in the same place, with the task's spec, recent repo state and decisions as the first prompt. The worktree, the branch, the commits on it and the task note are unchanged. To start a new task from that branch instead, run `agn run "<prompt>" --base <task>`.

**`agn adopt` lists several agents.** More than one agent is running under that path, and agn does not pick for you. Run it again with the pid from the first column: `agn adopt <path> --pid <n>`. If the pid you pass is no longer listed, the process has exited or is not an agent agn knows.

**`agn adopt` says the session is already task <id>.** The agent running under that path is registered already, so there is nothing to adopt. `agn status <id>` shows it. A retry of an adopt whose reply was lost says this too, which is not the same as agn finding no agent there. agn answers from its own task records, so it names the task even in the moments the process scan does not list the agent.

**`agn adopt` says the path is not inside the repo.** Adopt registers a session in a repo you have already added. Pass a path inside that repo, or `--repo <id or path>` to say which repo it belongs to.

**`agn run` says the repo is closed.** The repo was closed with `agn repo close`, and a closed repo takes no new tasks: `agn run`, `agn resume`, `agn handoff` and `agn adopt` all refuse. Run `agn repo open <id>` to open it again. `agn repos --all` lists the closed ones with their ids.

**`agn run` says the repo's folder is not there.** The folder agn has registered for the repo is not on disk now: it was moved, deleted, or it is on a volume that is not mounted. `agn repos` marks the path `(missing)`, and `agn run`, `agn resume`, `agn handoff` and `agn adopt` refuse. Mount or restore the folder and the repo works again; nothing is written while it is away. If the folder is gone for good, `agn repo remove <id>` hides the repo and deletes the worktrees agn made for its tasks. Its usage and outcome history stays, and `agn add <path>` on the same path later registers the same repo again, with its history.

**A second `agn run` in a folder says "folder workspaces run one task at a time".** A folder workspace has one working tree, so agn runs one task in it at a time. Stop the running task (`agn stop <task>`), or run `git init` in the folder: from the next `agn run` on, tasks get their own worktrees and branches and run in parallel.

**`agn handoff` says the branch "no longer exists".** The task you are handing off was cleaned with `--delete-branch`, so there are no commits for the next agent to continue from. Start the work again with `agn run "<prompt>"`. A task whose worktree was cleaned but whose branch was kept hands off normally.

**`agn outcomes` or `agn clean` hangs for a while right after `agn stop`.** The stop answers early and the task's accounting runs behind it, including the repo's `test_command`. Both commands wait for that work rather than read a half-written row. Run `agn outcomes <task>` again later, or shorten `test_command` in `.ag/agnostic.yaml`.

**`agn clean` says the task is still running.** Clean removes a task's worktree, so the agent has to be out of it first. `agn stop <task>`, then clean. The branch survives either way unless you pass `--delete-branch`, and so does the worktree unless you pass `--force`.

**`agn clean` says the worktree has uncommitted changes.** Removing it would throw that work away, so agn stops. Commit or stash it in the worktree the message names, or run `agn clean <task> --force` to discard it. `agn clean` with no task named keeps that worktree, prints one `kept` line for it and cleans the rest.

**The workspace terminal or `agn attach` shows a blank pane, or your tmux keys do nothing.** agn's tmux server reads `~/.agnostic/tmux.conf`, not your `~/.tmux.conf`: your prefix key, bindings and colours are not in effect there, and an error in your own config cannot break an agn session. agn rewrites that file at every daemon start, so edits to it do not survive. A server started before this version keeps the config it started with until it stops: `tmux -L agn kill-server` ends every agn session and the next `agn run` starts a server on the new config. `agn doctor` prints `tmux server predates the current config` when that is the case.

**The wheel does not scroll the workspace terminal or `agn attach`.** An agent's full-screen interface keeps its history in tmux's copy-mode, which a wheel event enters only when tmux is set to `mouse on`. agn writes that setting to `~/.agnostic/tmux.conf`, and tmux reads the file only when its server starts. Nothing agn does ends that server: `agn daemon restart` rewrites the file and leaves the server running, and `agn stop <task>` ends one session. The server exits when its last session ends, so stop every task (`agn status --all` lists them) or run `tmux -L agn kill-server`, which ends every agn session at once. The next `agn run` or `agn resume` starts a server on the new config. With `mouse on` a plain click-drag selects in tmux rather than in your terminal: hold Option (macOS) or Shift (elsewhere) in the workspace terminal, or in `agn attach` the modifier your terminal uses to bypass mouse reporting, to select text the usual way.

**`agn sync` says a file "was written by hand and agn will not overwrite that".** The file no longer starts with agn's generated header, so agn treats it as yours. Copy what you want to keep into `.ag/instructions.md`, then run `agn sync --force` to regenerate it. During `agn run` or `agn resume` the same case is not an error: the task starts on the file that is there, and the daemon log records `sync skipped`.

**Something you added to CLAUDE.md or AGENTS.md disappeared.** The header means agn owns the whole file, so an edit below an intact header is overwritten on the next sync with no conflict and no warning. Add the text to `.ag/instructions.md` and run `agn sync`; `git diff` on the generated file shows what was lost.

**`agn init` says CLAUDE.md and AGENTS.md "are both here and they differ".** agn will not guess which one your instructions live in, and it never concatenates them. Run `agn init --from CLAUDE.md` or `agn init --from AGENTS.md`.

**`agn usage` shows less than the agent's own usage screen.** They count different windows. agn counts the calendar day and the week from Monday, in your time zone; Claude Code and Codex show their plan's rolling window (five hours, seven days). agn also reads only what is in the transcript files on this machine, so a session run on another machine under the same login is not there.

**`agn usage` shows a `-` in the cost column.** Either the model runs on your subscription, where the tokens cost nothing extra, or agn has no price for the model the agent reported. Run `agn catalog update` to refresh the rates. Usage from a session agn did not start is never priced.

**`agn ui` says the workspace is not built.** The daemon serves the page from the `@agnostic/ui`
package next to it, and that package has no `dist` until it is built. From a checkout, run
`pnpm build`. From an install, reinstall `agnostic-dev`: a published package carries the page.

**`agn open` says no editor was found.** agn looks for an editor's command on the PATH the daemon was started with, and for its app bundle in `/Applications`, `~/Applications`, `~/Applications/JetBrains Toolbox` and `/System/Applications/Utilities`. Install the editor's shell command (in VS Code, "Shell Command: Install 'code' command in PATH") and run `agn daemon restart`, or install the app. If you named an editor agn cannot see, with `--editor` or the `editor` key in `~/.agnostic/config.yaml`, the error lists the ones it can.

**A model override isn't offered.** The provider key isn't in the environment the daemon was started from. Restart the daemon (`agn daemon restart`) after exporting the key.

**The daemon won't start.** Port in use or a stale `daemon.json` in `~/.agnostic/`. `agn daemon restart --force`. When a start fails, agn names the log file to read; the reason is in its last lines. If another `AGNOSTIC_HOME` already has a daemon on that port, `agn daemon status` says `foreign` and `--force` refuses and names the other home rather than killing it: stop that daemon where it lives, or start this one with `--port`.

**A command fails with "the agn daemon could not be started".** Every command except `agn daemon status` and `agn daemon stop` starts the daemon itself, so this means the start failed rather than that you forgot one. Check `~/.agnostic/logs/agnd.log`, then `agn daemon start` to see the error directly.

**You want to script agn.** `--json` prints the daemon's response body instead of a table, on `agn add`, `agn repos` (including `agn repos --all`), `agn repo close|open`, `agn repo remove`, `agn doctor`, `agn profiles`, `agn run`, `agn status`, `agn stop`, `agn clean`, `agn handoff`, `agn adopt`, `agn hooks install`, `agn init` and `agn sync`; on `agn attach` and `agn resume` it prints the tmux command instead of running it, and on `agn open` the editor command instead of running it. Exit codes: 0 ok, 1 the command failed, 2 the command line was wrong.

**Where things live.** Task database `~/.agnostic/agnostic.db`; worktrees `~/.agnostic/worktrees/<repo>/<task>`; the daemon log `~/.agnostic/logs/agnd.log`; the tmux config agn's server runs on `~/.agnostic/tmux.conf`.

**Reading the daemon log.** `tail -f ~/.agnostic/logs/agnd.log`. One line per request, with the method, path, status and duration. Prompts, task titles and your auth token are never written there.
