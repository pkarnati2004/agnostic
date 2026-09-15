# Workspace

`agn ui` opens the workspace in your browser (a desktop app is planned). It starts the daemon if
none is running, then opens `http://127.0.0.1:<port>/ui`. The daemon serves the page; nothing
leaves this machine.

```bash
agn ui                       # open it
agn ui --no-open             # print the address instead, to paste into another browser
```

The printed address ends in `#token=<token>`, which is how the page authenticates to the daemon.
The browser keeps the fragment to itself: it reaches no request line and no log. Treat that
address as a password, and open it only in your own browser.

If you pull a newer agn while a daemon from an older version is running, run `agn daemon restart`
once. A daemon that started before this version answers `/ui` with an authentication error rather
than the page.

- **Left:** your repos and their tasks. Dot = status: running, waiting for you, queued, done. A repo you closed with `agn repo close` is not shown.
- **Center:** the live terminal for the selected task. This is the agent's own session - approve tools, use plan mode, switch models exactly as in a terminal. Tabs keep scrollback.
- **+ Task:** describe the work, see the recommendation, pick or accept, run.
- **Bottom:** tokens and cost per plan, for today and for this week.

Everything the workspace shows comes from the local daemon; closing the tab loses nothing.

## Starting a task

"+ Task" at the top of the sidebar opens the dialog. Pick the repo, describe the work, and about a
second after you stop typing agn shows its pick. The card holds the same five lines
`agn recommend` prints: what agn made of the prompt, the recommended profile and why, the
alternative, what would be worth trying if you enabled it, and the risk.

The Profile select follows the pick until you change it, and then stays where you put it. What it
shows is what runs: agn sends that profile with the task, so `agn outcomes` later says both what
agn picked and what you chose. Intent is read from the prompt unless you set it yourself.

Enter writes a newline; Cmd+Enter (Ctrl+Enter) runs, as does the Run button. If the repo has a
`test_command`, agn runs it before the agent starts and the dialog says so while it waits. The
task opens in a tab as soon as it starts.

## Tabs

Clicking a task opens it in a tab in the centre. The tab holds the agent's own session: what you
type goes to the agent, and tool approvals, plan mode and model switches work as they do in a
terminal. Closing a tab leaves the task running; it only drops the view of it.

A tab keeps 5000 lines of scrollback while it is hidden, and tmux keeps the session's whole
history behind that. Open the same task in two tabs and both resize the one pane, so the output
wraps to the narrower of them; open a task once.

The open tabs and the one in front are remembered per daemon address, so a reload comes back to
the same tabs. A task you clean loses its tab.

When a session is over the tab says so and offers Resume, which starts the agent again in the
same worktree, rebuilding it from the task's branch first if the worktree was cleaned and saying
which branch it came from. If the daemon restarts, the tab reconnects by itself: tmux held the session while
it was gone. A session that was adopted from outside tmux cannot be attached to, and the tab says
that instead.

## History

A finished task whose worktree is gone moves into a History section under its repo, below the
repo's other tasks. The heading counts them: "History (3)". History is collapsed when the page
loads; click the heading to list them, newest first. A row there opens in a tab like any other.
The section holding the task you have open shows its rows without being clicked.

Tasks reach History when `agn clean` removes their worktree, when the sweep does, and when you
delete the directory yourself. A task that ran in a folder workspace never had a worktree of agn's,
so it stays under its repo.

## When an action fails

Stop, Resume and Hand off answer where you asked for them: under the task header, on the terminal's
overlay, or in the handoff dialog, which stays open so you can change the profile and try again.
The line names the task and repeats the daemon's message and hint. It clears itself after a few
seconds, or sooner if the next action on that task works. The only message across the whole page
is the one for a workspace that could not load.

## The usage bar

Along the bottom there is one cell per plan: tokens and cost for today and for this week, and for
Claude the share of those tokens that ran on Fable. The figures are the ones `agn usage` prints,
from the same scan of your transcripts on this machine. Hover a cell for the week figures when the
window is too narrow to show them, and for tokens from sessions agn did not start - your plan's
meter counts those and agn cannot price them. Both windows are calendar windows in your own time
zone: today is today, and the week starts on Monday. Vendors measure their limits over rolling
windows, so these numbers and the ones your harness reports will differ.

The selected task's own tokens and cost sit in its header, beside Stop and Resume. A task billed to
a subscription reads `included in plan` rather than a price.

## Write spec

In the new-task dialog, **Write spec** turns your one-liner into a title, a spec and a checklist of
acceptance criteria. agn runs one of your own agents in the repo, headless and read-only, with the
same repo state a launched agent gets: recent tasks, what is in flight, and your recorded decisions.
It edits nothing and runs nothing.

The three fields - title, spec and acceptance - appear once a spec arrives; **Write it yourself**
opens them empty. They are yours to edit before you run, and a field you empty is left out. Run
writes them into the task note's Spec and Acceptance sections, which is what the agent reads first.
The one-liner stays the task's prompt.

agn picks the cheapest model you already pay a subscription for, Claude Code first. A model metered
on credits is never picked for you. To name one yourself, set `spec_writer` in
`~/.agnostic/config.yaml`. If nothing on the machine qualifies, agn says so and you write the spec
in the dialog.

Spec writing was verified with Claude Code. The headless flags for Codex, Pi and OpenCode follow
each vendor's documented headless form and have not been run here. If one of them rejects a flag,
report it; the flag will be dropped.

## After a task

`agn outcomes <task>` prints what one finished task cost and what became of it: how long the agent ran, its tokens and cost, the model it resolved to, the test results from before and after, how many lines it changed, and how many lines you changed afterwards. The verdict is `accepted` once the task's branch is merged into the base branch, by a merge commit or a squash; `reverted` once the branch is deleted or its worktree is removed without a merge; `not merged` until one of those happens. agn rechecks the open ones every five minutes and again whenever you ask for them, so a branch you merged a moment ago reads as accepted. A task that ran in a folder workspace has no branch of agn's, so its verdict and line counts print as `-`.

`agn stop` returns as soon as the agent is gone and finishes the task's accounting behind it: the usage scan, the repo's `test_command`, and the outcome row. An `agn outcomes` or `agn clean` run straight after a stop waits for that work, so it can take as long as your test command does.

## Working on the workspace itself

From a checkout: `pnpm build` writes the page the daemon serves, and `pnpm dev` runs the daemon
and the Vite dev server together, with the page on `http://127.0.0.1:5173/ui/`.
