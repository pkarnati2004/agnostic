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

- **Left:** your repos and their tasks. Dot = status: running, waiting for you, queued, done. A closed repo and its tasks are not in the list; they are under "Closed" at the foot of the sidebar.
- **Center:** the live terminal for the selected task. This is the agent's own session - approve tools, use plan mode, switch models exactly as in a terminal. Tabs keep scrollback.
- **+ Task:** describe the work, see the recommendation, pick or accept, run.
- **Right:** what the selected task has changed, with the patch of the file you click. "Changes" in the task header opens and closes it.
- **Compare:** `agn compare` runs one prompt on several agents at once. The siblings are one row in the sidebar, and the row opens a Compare view with a column per agent.
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

If you have set a `budget` and the selected profile is billed by the token, a note under the
Profile select says what has been spent. Past the ceiling the note says the run would be refused
and offers a checkbox, "Ignore the budget for this task", which runs it anyway this once. The
handoff dialog carries the same note. See [Budgets](usage.md#budgets).

## Repos

The folder icon in the sidebar header adds a repo. Type the full path to a folder on this machine,
starting with `/`: the browser cannot expand `~` or a path relative to a terminal, and it has no
picker that yields a real path, so the field is plain text. A folder with no `.git` is registered
as a folder repo and tasks run in it in place; tick "Run git init first" to make it a git repo
before agn registers it. A path agn already has is named rather than added twice.

Each repo heading has a Close button. Closing takes the repo and its tasks out of the list, the
same as `agn repo close`. Nothing is deleted: the repo keeps its rows, and `agn usage` and
`agn outcomes` keep counting its history. agn refuses to close a repo with a task still running or
waiting, and says which task to stop first.

Closed repos sit under "Closed (n)" at the foot of the sidebar, collapsed when the page loads.
Open it and each row has Reopen, which puts the repo and its tasks back where they were. A closed
row whose folder is gone reads `<path> (not found)`.

If a repo's folder is not where agn registered it, its heading reads `Not found: <path>`. The repo
and its tasks stay in the list, and agn refuses to start, resume or hand off a task in it until the
folder is back. Nothing is written, so mounting or restoring the folder clears the marker on the
next load.

A heading with that marker also has a Remove button, and so does every row under "Closed". Remove
hides the repo for good, closes any open tabs for its tasks, and deletes the task worktrees agn
made for it, with any uncommitted work in them; the folder you registered is not touched. The
repo's usage and outcome history is kept, and `agn add <path>` registers the same row again with
that history attached. agn asks you to confirm first, and refuses to remove a repo with a task
still running or waiting. To remove a repo whose folder is still there, close it first and use
Remove on its row under "Closed".

## Tabs

Clicking a task opens it in a tab in the centre. The tab holds the agent's own session: what you
type goes to the agent, and tool approvals, plan mode and model switches work as they do in a
terminal. Closing a tab leaves the task running; it only drops the view of it.

A tab keeps 5000 lines of scrollback while it is hidden, and tmux keeps the session's whole
history behind that. Open the same task in two tabs and both resize the one pane, so the output
wraps to the narrower of them; open a task once.

Scroll the wheel in the pane to read back through the output. Most agents draw a full-screen
interface, whose history belongs to tmux, so the wheel puts the pane into tmux's copy-mode; `q`
leaves it. tmux takes the plain click-drag as well: hold Option (macOS) or Shift (elsewhere) while you drag to select text in
the browser instead, and in `agn attach` hold the modifier your terminal uses to bypass mouse
reporting (Option in iTerm2, Shift in most Linux terminals). If the wheel does nothing, agn's
tmux server predates this setting; troubleshooting says how to restart it.

The open tabs and the one in front are remembered per daemon address, so a reload comes back to
the same tabs. A task you clean loses its tab.

When a session is over the tab says so and offers Resume, which starts the agent again in the
same worktree, rebuilding it from the task's branch first if the worktree was cleaned and saying
which branch it came from. If the daemon restarts, the tab reconnects by itself: tmux held the session while
it was gone. A session that was adopted from outside tmux cannot be attached to, and the tab says
that instead.

## Changes

"Changes" in the task header opens a third column on the right, and closes it again. The workspace
remembers which it was, per daemon address. On a window narrower than 1280 px the column starts
closed, so the terminal keeps its width; the state is read when the page loads, so a window you
widen afterwards still needs the toggle.

The line at the top names the task's branch, the base branch it is read against, how many commits
it is ahead, how many files have uncommitted changes, and "behind n" when the base has moved on.
Under it are the files the branch changed: everything the agent has written, committed or not,
including files git has not been told about yet. Each row has the status letter `agn changes`
prints - A, M, D, R, `?` for untracked - and the lines added and removed. Click a row for that
file's patch below the list. The first file is selected when the panel opens.

The panel re-reads itself when the task changes status and when you click Refresh; nothing watches
the files, so Refresh is how you see what the agent wrote a moment ago. **Open in editor** opens
the task's worktree in the editor agn is configured for, and the chevron beside it lists the other
editors on this machine. The daemon starts the editor, so a daemon running over ssh cannot: it
says so, and `agn open <task>` from your own terminal does it instead.

Some tasks have no file list to show:

- A folder workspace has no git to read, so the panel says "git init to enable" and gives the
  command.
- A task agn adopted has no base commit of its own, so its header reads
  "adopted: changes against `main`".
- A task whose worktree was cleaned reads "worktree cleaned; branch `<branch>` kept" and shows what
  was committed. Open in editor and Bring up to date wait until Resume rebuilds the worktree.
- A branch with nothing on it yet reads "No changes against `<base>` yet."
- A binary file reads "binary file, no diff": git has no patch for it.

## Create PR

**Create PR** opens a dialog that says what agn is about to do: the remote it will push to, the
branch, the base the pull request will target, and the title, which is the only field you can
change. If the worktree holds uncommitted changes the dialog says how many stay behind - only
commits are pushed - and if the branch is behind its base it says by how many commits.

"Push and create PR" pushes the branch to origin once. agn never force-pushes, never pushes to
another remote, and never fetches. It uses git's own credentials, so the daemon has to be able to
reach your ssh agent or credential helper. If git refuses the push, the dialog says what git said;
when the remote is ahead, bring the branch up to date first and try again.

With the `gh` CLI installed and logged in, agn creates the pull request and the tab it opened goes
to it. A branch that already has a pull request open gets its new commits under that one, not a
second. Without `gh`, the tab goes to GitHub's compare page with the title filled in. Either way
the description - the task note's Spec, Acceptance and latest Handoff sections - is written to your
clipboard, and the dialog keeps it on screen with a Copy description button if your browser refused.

A task started with `agn run --base <task>` opens its pull request against that task's branch, so
the diff holds only its own work. GitHub retargets it at the base branch when the parent merges.

`agn pr [<task>]` does the same from a terminal, with `--title <t>` and `--no-open`.

## Bring up to date

**Bring up to date** asks the agent to bring its branch level with the base it is read against.
agn runs no git command for it: it sends the agent one message, and the agent fetches, rebases or
merges, resolves the conflicts and runs the tests in its own session. The tooltip says what the
message will ask for before you click.

The message is one line: fetch the base, bring the branch up to date with it, resolve conflicts,
run the repo's `test_command` and keep it green, and do not push. Which way depends on where the
branch has been. A branch nobody has pushed is rebased onto the base. A branch that is on origin is
merged into instead, because rewriting a published branch would break whoever has it.

If the agent's session is still running, the message is typed into it, as if you had typed it in
the terminal yourself. If the session has ended, agn resumes the task with the message as the
first turn: the agent picks its conversation up where it can, and starts fresh with the task
context and the message where it cannot. The panel says which happened.

Two tasks cannot be asked this way. A task whose worktree was cleaned needs Resume first, which
rebuilds the worktree. A session agn adopted that is not running under tmux has no pane agn can
type into, so agn hands you the message to paste into that terminal yourself.

`agn update [<task>]` does the same from a terminal. It prints where the message went, which mode
the branch got and why, and the `agn attach` line for watching the work; it never takes the
terminal over.

## Compare

`agn compare "<prompt>"` runs one prompt on two to four profiles at once. Each agent gets its own
worktree and branch, so they never touch each other's work. Name the agents with
`--profiles a,b`; leave it out and agn compares its own recommendation against the alternative it
names.

The siblings are one row in the sidebar, wherever their tasks would have been. The row carries the
compare icon and the title, and its second line counts what the agents are doing:
`compare · 2 agents · 1 running, 1 stopped`. The chevron lists the siblings under the row, each
one a task row that opens its own terminal tab. The row is open while an agent is still running
and closed once none is. Which agent a pick kept is said in the Compare view, not in the sidebar.

Clicking the title opens the Compare view in the centre. It is a tab like a terminal: it sits in
the strip beside them, closes the same way, and comes back when you reload the page. The view has
one column per agent with the profile, the status, the files changed, the lines added and removed,
the tests, the cost and the time. **Open** on a column brings that agent's terminal to the front.

**Pick** keeps one agent. agn stops the others, removes their worktrees and keeps their branches,
so nothing committed is lost; they read as reverted in History and in `agn outcomes`. A
confirmation dialog says how many agents that is before anything happens. You can pick again
later: the second pick stops and cleans whatever is still standing, including the agent the first
pick kept, and its branch stays too.

The table refreshes when the agents' events arrive - a stop, a clean, a usage row - and on
**Refresh** in the header. Nothing polls. The tests column of an agent that has just stopped reads
`-` until its close work records the outcome a few seconds later; Refresh fetches it.

`agn compare show <id>` prints the same table in a terminal, and `agn compare pick <id> <task>`
keeps one from there.

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

If `~/.agnostic/config.yaml` sets a `budget`, a last cell shows what this machine has spent against
it: `$4.10 / $5.00 today` and the week beside it. The cell turns amber at 80% of a ceiling and red
at 100%. Hover it for the percentage and for what is counted - API-key and credits runs, never
subscription runs. See [Budgets](usage.md#budgets).

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

`agn stop` returns as soon as the agent is gone and finishes the task's accounting behind it: the usage scan, the repo's `test_command`, and the outcome row. An `agn outcomes` or `agn clean` run straight after a stop waits for that work, so it can take as long as your test command does. On a task adopted from a terminal of your own, stop ends that agent process too: SIGTERM first, then SIGKILL if it is still there five seconds later.

## Working on the workspace itself

From a checkout: `pnpm build` writes the page the daemon serves, and `pnpm dev` runs the daemon
and the Vite dev server together, with the page on `http://127.0.0.1:5173/ui/`.
