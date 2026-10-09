# @agnostic/executor-tmux

The one `ExecutorProvider` (`tmux-local`): it gives a task a place to run and a way back to it.

- `prepare` makes a git worktree from a base commit on branch `agn/<slug>-<task>` and runs the
  repo's `setup_command` in it. A folder repo runs in place, with no branch and no git call.
- `launch` starts the command it is given as the pane process of a tmux session `agn-<task>` on
  agn's own socket, so a plain `tmux ls` or `tmux kill-server` never sees or ends an agent.
- Exit is reported without scraping the terminal: `remain-on-exit` plus a `pane-died` hook writes
  the status under `~/.agnostic/sessions/`, and the watcher turns that into an `exited` event even
  when the exit happened while the daemon was down.
- Every tmux command for agn's socket carries `-f ~/.agnostic/tmux.conf`, a three-line file the
  executor rewrites at start: agn's server never reads the user's `~/.tmux.conf`, and the user's
  own server, where an adopted session may live, is never given agn's. Its `default-terminal` is
  `tmux-256color` where the machine's terminfo has that entry and `screen-256color` where it does
  not, which is why building the executor is asynchronous.
- `terminal` attaches one more tmux client, under a pty, and hands back its bytes: the session and
  the pane are untouched, so closing a terminal ends that client and nothing else.
- `detect` finds harness processes running under a path, whether or not agn started them, for
  `agn adopt`.

It is not: profiles, prompts, hooks, HTTP, or the decision of how to resume a task - the daemon
composes the command and owns that tree. A worktree is isolation for edits, not a sandbox: the
agent runs with the user's own permissions.
