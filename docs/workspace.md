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

- **Left:** the sidebar. "New task" and "Search" sit under the wordmark; Search opens the command palette. Tasks waiting for an answer are listed under "Needs you" above the repos, with how long each has waited. The foot of the sidebar says whether agnd is running and which version. The panel icon collapses the sidebar to a 52 px rail of repo initials, each with a dot when a task there is waiting, failed or running, in that order; clicking one opens the sidebar again.
- **Repos and tasks:** your repos and their tasks. The glyph before a title says where the task is: a dot with a halo for "Waiting for you", a filled dot for "Running" and for "Failed", a turning ring for "Running tests", a hollow ring for "Done", a square for "Stopped". A task whose worktree agn has cleaned up draws a dashed ring. The mark at the right of a row is the harness running it. The second line is the task's branch, "Running tests before launch" or "Starting" while it waits to launch, and `<branch> · <status>` once it is over; a task handed off from another sits indented under it and reads "From `<harness>`". A closed repo and its tasks are not in the list; they are under "Closed" at the foot of the sidebar.
- **Center:** the live terminal for the selected task. This is the agent's own session - approve tools, use plan mode, switch models exactly as in a terminal. Tabs keep scrollback. The line above the terminal says the task's status, its profile, the repo, the branch and how long it has run.
- **New task:** the row in the sidebar, and the "+" at the end of the tab strip, open the New task tab: describe the work, see agn's pick, keep it or change it, start.
- **Right:** what the selected task has changed, with the patch of the file you click. "Changes" in the task header opens and closes it.
- **Compare:** `agn compare` runs one prompt on several agents at once. The siblings are one row in the sidebar, and the row opens a Compare view with a column per agent.
- **Bottom:** the usage bar: one cell per plan with its rate-limit percent or its tokens, the budget, and what the task in front has spent. See [The usage bar](#the-usage-bar).

Everything the workspace shows comes from the local daemon; closing the tab loses nothing.

## Starting a task

"New task" at the top of the sidebar, or the "+" at the end of the tab strip, opens the New task tab.
There is one of it: a second click brings it to the front and keeps what you have typed.

Describe the work. About a second after you stop typing, agn shows its pick: the profile it
recommends, what that profile costs, why it won, how much evidence stands behind the reason, and
which benchmarks and histories the reason was read from. Confidence is a word, never a percentage.
Under the pick are the alternative agn would have taken instead and, where there is one, the agent
worth trying once you enable it, with the step that would enable it. A prompt that matches a
`risk_rules` area carries a risk line. With nothing measured to go on, the card says "No evidence;
using your default." rather than inventing a reason.

The chips under the prompt are the four things worth saying before the task starts: the repo, the
intent, the profile, and whether agn writes a spec first. Intent is read from the prompt unless you
set it yourself, and while it is on auto the chip says what the prompt reads as. The profile chip
reads "Profile: recommended" until you pick one, and then reads the profile you picked. What it
shows is what runs: agn sends that profile with the task, so `agn outcomes` later says both what agn
picked and what you chose.

The arrow starts the task. Enter writes a newline; Cmd+Enter (Ctrl+Enter) is the arrow. If the repo
has a `test_command`, agn runs it before the agent starts and the tab says so while it waits. The
task opens in a tab of its own as soon as it starts, and the New task tab closes.

The line under the composer says where the task will run: this machine, the repo, and whether agn
makes a worktree for it or works in the folder in place. At its right, "Detected" marks the coding
agents this machine has. A reload does not keep a draft; the tab comes back empty.

With no tab open at all, the centre draws the same composer under "What should an agent work on?".
On a machine with no repo yet it offers to add one.

The first prompt ends with a "Before you finish" section that asks the agent to commit its work on
the task branch. The text is `.ag/prompts/commit.md` if the repo has one, and agn's own prompt if
not. agn never commits and never pushes; the agent does both or neither.

If you have set a `budget` and the selected profile is billed by the token, a note under the chips
says what has been spent. Past the ceiling the note says the run would be refused
and offers a checkbox, "Ignore the budget for this task", which runs it anyway this once. The
handoff dialog carries the same note. See [Budgets](usage.md#budgets).

## Repos

The folder icon on the "Repos" heading adds a repo. Type the full path to a folder on this machine,
starting with `/`: the browser cannot expand `~` or a path relative to a terminal, and it has no
picker that yields a real path, so the field is plain text. A folder with no `.git` is registered
as a folder repo and tasks run in it in place; tick "Run git init first" to make it a git repo
before agn registers it. A path agn already has is named rather than added twice.

Each repo heading has a Close button. Closing takes the repo and its tasks out of the list, the
same as `agn repo close`. Nothing is deleted: the repo keeps its rows, and `agn usage` and
`agn outcomes` keep counting its history. agn refuses to close a repo with a task still running or
waiting, and says which task to stop first.

Closed repos sit under "Closed" at the foot of the sidebar, with the count at the right of the
row, collapsed when the page loads.
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

The close button is on the tab in front only, so the strip holds still as the pointer crosses it.
The "+" at the end starts a task. A tab whose task is waiting for an answer keeps an orange top
edge whichever tab is in front; the tab in front has a blue one.

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
the same tabs. A task you delete loses its tab.

When a session is over the tab says "Session ended" and offers two things. **Resume session**
starts the agent again in the same worktree, naming the harness and the branch it reopens in, and
rebuilds the worktree from the task's branch first if it was cleaned. **Hand off** gives the task to
another agent instead; it is not offered once the worktree is gone. Under both, "From a shell:
`agn resume <task>`" names the command that does the same thing in a terminal.

If the daemon restarts, the tab reconnects by itself: tmux held the session while it was gone. A
session adopted from outside tmux cannot be attached to. That tab names the process id, says agn
tracks the task's status and changes but cannot type into it, and names `agn status <task>`.

A task waiting for an answer says so in a line under its header: "The agent asked a question. Answer
in the terminal below."

## Command palette

Press Cmd-K (Ctrl-K outside macOS) to open the command palette. It lists what agn can do on this
page, filtered by what you type, and runs the row you pick. The arrow keys move, Enter runs, Escape
closes. The shortcut works while a terminal tab has the focus: agn takes the keystroke before the
terminal does.

The rows are grouped, with a heading over each group: "Run" for "New task" and the two rows a typed
prompt adds, then "Current task" for the tab in front, then "Commands". Each row carries the icon of
the button it stands for.

Four rows are always there: "New task"; "Cost", which brings the usage bar into view and highlights
it; "Add repo"; and "Sync `<repo>`" for the repo you are working in. Sync writes that repo's
generated files, the same ones `agn sync` writes, and says nothing when they are already current. A
failure appears under the repo in the sidebar.

Typing a prompt adds two more rows:

- **Run: `<prompt>`** opens the New task tab with the prompt filled in. Use it when you want a
  title, a spec, or a profile of your own choosing before the task starts.
- **Recommend: `<prompt>`** asks agn which profile fits and replaces the list with the answer: the
  recommended profile, the alternative when there is one, and "Back". Enter on a profile runs the
  prompt on it at once, with no title and no spec.

The rest of the rows act on the tab in front: "Stop", "Resume", "Hand off", "Open in editor",
"Create PR for", "Ask <task> to commit", "Bring up to date", "Archive task" and "Delete task…".
The first seven are named after the task. A row
appears only when the button it stands for would work, as far as the palette can tell without
reading the branch, so a finished task offers Resume and not Stop. A task whose worktree has been
cleaned offers none of "Hand off", "Open in editor" and "Bring up to date" until you resume it;
"Create PR for" stays, because the push reads the branch from the repo itself. "Ask <task> to
commit" appears once the Changes panel has read the task and found uncommitted work, since the
count comes from that read. The Compare tab has no task of its own, so no task rows appear while it
is in front.

## Changes

"Changes" in the task header opens a third column on the right, and closes it again. The workspace
remembers which it was, per daemon address. On a window narrower than 1280 px the column starts
closed, so the terminal keeps its width; the state is read when the page loads, so a window you
widen afterwards still needs the toggle.

The column is headed "Changes" with the number of changed files, a Refresh button and a close
button; closing it is the same as the toggle in the task header. The line under the heading names
the task's branch, the base branch it is read against, how many commits it is ahead, how many files
have uncommitted changes, and "n behind" in yellow when the base has moved on.

Under it are the files the branch changed: everything the agent has written, committed or not,
including files git has not been told about yet. Each row starts with the status letter `agn changes`
prints, coloured: green A for added, yellow M for modified, red D for deleted, and a muted R or `?`.
The directory is muted and the file name is not. The lines added and removed are at the right. Click
a row for that file's patch below the list. The first file is selected when the panel opens.

The rows sit under Unstaged, Staged and Committed, in that order, with a count on each heading. A
group with nothing in it is left out, and a list where everything is committed has no heading at
all. A file with both staged and unstaged edits is one row under Unstaged, which is what "Ask the
agent to commit" would commit. Untracked files are unstaged.

The panel re-reads itself when the task changes status and when you click Refresh; nothing watches
the files, so Refresh is how you see what the agent wrote a moment ago. **Open in editor** opens
the task's worktree in the editor agn is configured for, and the chevron beside it lists the other
editors on this machine. The daemon starts the editor, so a daemon running over ssh cannot: it
says so, and `agn open <task>` from your own terminal does it instead.

Some tasks have no file list to show:

- A folder workspace has no git to read, so the panel says "This folder is not a git repo." and
  gives the command that would make it one.
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

Uncommitted changes stay in the worktree: only commits are pushed. "Ask the agent to commit" is
how you get them into a commit first.

`agn pr [<task>]` does the same from a terminal, with `--title <t>` and `--no-open`. When the
worktree holds uncommitted changes it prints one line to stderr saying how many stay behind.

## Ask the agent to commit

**Ask the agent to commit** in the Changes panel sends the agent a prompt to commit what it has
written on the task branch. The prompt is `.ag/prompts/commit.md` if the repo has one and agn's own
if not, and it is sent as written. agn runs no git command for it, and never pushes.

If the agent's session is still running, the prompt is typed into it. If the session has ended, agn
resumes the task with the prompt as the first turn. The panel says which happened. Nothing on the
page moves when the commit lands, so click Refresh to see it.

The button is enabled while the task has a worktree of agn's, uncommitted changes in it, and an
agent to ask: a running or waiting session, or a task that can be resumed. At zero uncommitted
changes it reads "Nothing to commit: the working tree is clean. The files listed are the branch's
commits against `<base>`.", and a task whose worktree was cleaned needs Resume first.

`agn commit [<task>]` does the same from a terminal. It prints one line: which profile was asked,
and whether the prompt went to a live session or to a resume.

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

An agent that is showing a screen of its own - a trust question, a hooks review - takes no message
either: agn refuses with `agent-not-ready` rather than answer the screen for you, so answer it in
the task's terminal and try again. The same holds for Ask the agent to commit and for a resume turn.

`agn update [<task>]` does the same from a terminal. It prints where the message went, which mode
the branch got and why, and the `agn attach` line for watching the work; it never takes the
terminal over.

## Compare

`agn compare "<prompt>"` runs one prompt on two to four profiles at once. Each agent gets its own
worktree and branch, so they never touch each other's work. Name the agents with
`--profiles a,b`; leave it out and agn compares its own recommendation against the alternative it
names.

The siblings are one row in the sidebar, wherever their tasks would have been. The row is one line:
a dot per agent in its status colour, the title, and how many agents there are. The tooltip says
what they are doing: `compare · 2 agents · 1 running, 1 stopped`. The chevron lists the siblings
under the row, each one a task row that opens its own terminal tab. The row is open while an agent is still running
and closed once none is. Which agent a pick kept is said in the Compare view, not in the sidebar.

Clicking the title opens the Compare view in the centre. It is a tab like a terminal: it sits in
the strip beside them, closes the same way, and comes back when you reload the page. The header
names the task and reads "n agents, same prompt, separate worktrees. Pick one to keep; the others
close." The view has one column per agent, each headed by the agent's profile, with the status, the
files changed, the lines added and removed, the tests, the cost and the time. **Open** on a column
brings that agent's terminal to the front.

**Pick** keeps one agent. agn stops the others, removes their worktrees and keeps their branches,
so nothing committed is lost; they read as reverted in History and in `agn outcomes`. A
confirmation dialog says how many agents that is before anything happens. You can pick again
later: the second pick stops and cleans whatever is still standing, including the agent the first
pick kept, and its branch stays too.

The kept column is tinted, marked "Picked" under its profile, and its button reads "Picked" and
does nothing. The others read "removed · branch kept".

The table refreshes when the agents' events arrive - a stop, a clean, a usage row - and on
**Refresh** in the header. Nothing polls. The tests column of an agent that has just stopped reads
`-` until its close work records the outcome a few seconds later; Refresh fetches it. An agent that
finished with no tests recorded reads "did not run".

`agn compare show <id>` prints the same table in a terminal, and `agn compare pick <id> <task>`
keeps one from there.

## History

A finished task whose worktree is gone moves into a History section under its repo, below the
repo's other tasks. The row counts them at its right. History is collapsed when the page
loads; click the heading to list them, newest first. A row there opens in a tab like any other.
The section holding the task you have open shows its rows without being clicked.

Tasks reach History when you archive them, when `agn clean` removes their worktree, when the
sweep does, and when you delete the directory yourself. A task that ran in a folder workspace never had a worktree of agn's,
so it stays under its repo.

Hand off is not offered for a task whose worktree is gone: the next agent would have nowhere to
work. Resume rebuilds the worktree from the task's branch and the button comes back. `agn handoff`
still accepts the task.

## Archive and delete

Every task row carries a menu. Right-click anywhere on the row, or press Shift+F10 with the row
focused. The task header has the same menu under its own "…", and the command palette
offers the two rows this section is about.

The menu holds: **Copy branch name**, **Copy task id** and, while an agent is running,
**Copy attach command** (`agn attach <task>`, to paste into a terminal); **Open in editor**;
then what can still be done with the task - **Stop** or **Resume**, **Hand off** and
**Create PR** - and last **Archive** and **Delete…**. A row you cannot use is left out, except
Delete, which stays and reads "Stop the task first" while the task is queued, running or waiting.

**Archive** is `agn clean` from the page. It is offered on a finished task that still has a
worktree of agn's, and it removes that worktree: "Removes the worktree. The task moves to History;
Resume rebuilds it from its branch." The branch is never deleted from the page; `agn clean
<task> --delete-branch` is the only way to do that.

If the worktree still holds work no commit has, the daemon refuses and the menu answers in place:
"3 files are not committed. Archive anyway?", with **Keep** and **Archive anyway**. Archive anyway
removes the worktree and the uncommitted work with it. Asked for from the task header or the
palette, the same question appears under the header.

After an archive the row lands in History, highlighted, reading "Archived just now" for ten
seconds, and a line at the foot of the page says "<title> moved to History" with **Resume** beside
it. Resume rebuilds the worktree from the branch and starts the agent again.

**Delete…** removes the task from agn. It is offered on any task that is not queued, running or
waiting, and it asks first:

> Delete <title>? This removes the task's worktree and every agn record for it: the task, its
> events and its outcome. The branch `<branch>` stays in <repo>. The tokens this task used stay in
> the usage totals.

With uncommitted work in the worktree the dialog adds "3 uncommitted files in the worktree will be
lost." and names the first two. For a task in History there is no worktree left, so the dialog says
the records alone are going.

What a delete leaves behind: the branch, the usage totals (the tokens are still counted, with no
task to count them against), the task's note in `.ag/tasks/<task>.md`, and any task handed off from
this one, which becomes a task of its own. What it takes: the worktree, the task's row, its events
and its outcome. `agn outcomes` and `agn status` no longer know the task. The task's tab closes
with it, and `agn task delete <task>` does the same thing from a terminal.

## Hand off

**Hand off** in the task header gives the task to another agent. The dialog shows who has it now,
who would take it, and agn's pick for the task's own prompt, in the same card the New task tab
draws. The select follows that pick until you change it, and the button names where the task is
going: "Hand off to codex".

Write a note for the next agent if there is something it should know. The child task starts in the
same worktree on the same branch, and the current session stops when the new one starts.

## When an action fails

Stop, Resume and Hand off answer where you asked for them: under the task header, on the terminal's
overlay, or in the handoff dialog, which stays open so you can change the profile and try again.
The line names the task and repeats the daemon's message and hint. It clears itself after a few
seconds, or sooner if the next action on that task works. The only message across the whole page
is the one for a workspace that could not load.

Archive and Delete answer where they were asked for too: Archive in the menu or under the header,
Delete in its own dialog, which stays open so you can read what the daemon said.

## When the daemon is down

If the daemon stops, a red line appears under the tab strip: "agnd is not running. Start it with
`agn daemon start` and this window reconnects. Agents keep running in tmux meanwhile." **Retry** on
that line reads the workspace again and reopens the event feed. The foot of the sidebar reads "agnd
not running" at the same time.

The page waits three seconds before it says anything, so an `agn daemon restart` that comes back
quickly shows nothing. Your agents are not affected either way: they run under tmux, and the page
picks them up where they are when the daemon is back.

## Catalog

agn checks once a day for a newer benchmark catalog, which is what the recommender reads. If the
last check is more than seven days old or it failed, a yellow line says so and offers **Update
now**. That runs the same check `agn catalog update` runs: one request, for the catalog file. If the
check is turned off in `config.yaml`, the page says nothing about it.

## The usage bar

Along the bottom there is one cell per agent agn found that records usage, each 28 px tall and
separated by a hairline. A cell
starts with the mark of the harness the plan is billed through: C for claude-code, X for codex, O
for opencode, π for pi, G for gemini, and the first two letters of the name for any other harness
(Gr for grok, Ki for kimi, Cu for cursor-agent). A plan agn has no vendor for reads `?`. Then comes
the plan's name, `Claude max20`, and its figures.

Where a file on this machine says how much of the plan's rate limit is spent, the figures are a bar
for the 5-hour window and the percentages: `5h 58% week 41%`. The bar turns yellow at 80% and red at
95%. A figure older than two hours reads `~58%`, dimmed, and dims the bar with it. A window past its
reset reads `–`. See [Limits](usage.md#limits) for which agents report a limit and how agn reads it.

Where nothing on this machine reports a limit, the figures are tokens for today and for this week,
shortened to fit: `today 2.1M tok week 9.8M tok`. A window agn could price carries the price after
the tokens, `184k tok · $1.92`; a plan that priced nothing reads `included in plan`.

An agent with no tokens today or this week keeps its cell. Where a file on this machine reports a
limit, the cell shows its percentages. Where none does, the figures read `nothing this week`.

When agn cannot tell which plan you are on, the cell asks instead of showing figures: **Which Claude
plan are you on?** followed by a chip per plan the catalog knows. One click writes the plan and the
cell turns into its figures on the next read. **Other** replies with the command for a plan the
catalog does not list. It is one line in the bar, never a dialog, and the workspace asks once per
page load.

Hover a cell for the plan's usage panel:

- One row per window the agent reported. Every vendor's rows are **5-hour window** and **This
  week**, one label per window, so two plans in the same panel do not read as if they measured
  different things. Each row has its reset time, a bar in the same colours as the cell, and
  `58% used`. A window past its reset keeps its row and reads `–`, with no bar and no reset time.
- `as of 3 h ago` under the rows, once the figure is five minutes old or more. It dates the rows
  only. The token counts below are rescanned every minute.
- The tokens: `274M tokens this week, 12.1M by agn · 105M today, 3.2M by agn`, to three
  significant figures. `by agn` leaves out the sessions agn did not start; your plan's meter counts
  those and agn cannot price them. For a Claude plan the line ends with the share of those tokens
  that went to a Fable model.
- For a plan you pay a subscription for, `≈ $12.40 at API rates, not billed`. For a plan metered by
  the token, the real cost: `$1.92 this week · $0.40 today`.

The token windows are calendar windows in your own time zone: today is today, and the week starts
on Monday. The rate-limit windows are the vendor's own rolling
ones, so the two sets of figures count different spans. The week resets at Monday 00:00, so on
Monday morning most cells read `nothing this week` until you take your first turn.

If `~/.agnostic/config.yaml` sets a `budget`, a cell after the plans shows what this machine has
spent against it: `today $4.10 of $5` and the week beside it. Past 80% of a ceiling the cell is
yellow and says **Past your 80% budget**; at 100% it is red and says **Over budget**. Hover it for
the percentage and for what is counted - API-key and credits runs, never subscription runs. A
subscription plan's own cell never mentions a budget, because those runs are not counted against
one. See [Budgets](usage.md#budgets).

At the right end, **This task** is what the task in front has spent: its tokens and its cost, or
`included in plan` for a task billed to a subscription, or `no usage yet` before anything is
recorded. The Compare tab and the New task tab have no task of their own, so they show no such cell.

## The spec step

Turn on **Write the spec** in the composer and the arrow writes a spec before anything runs. agn
runs one of your own agents in the repo, headless and read-only, with the same repo state a launched
agent gets: recent tasks, what is in flight, and your recorded decisions. It edits nothing and runs
nothing.

The step holds a title, a spec and the acceptance criteria, one per line. They are yours to edit,
whoever wrote them, and a field you empty is left out. **Rewrite** asks the model again. **Back**
goes to the prompt and keeps it. **Approve and start** runs the task and writes the spec and the
acceptance into the task note's Spec and Acceptance sections, which is what the agent reads first.
The one-liner stays the task's prompt. Nothing is started until you approve.

agn picks the cheapest model you already pay a subscription for, Claude Code first. A model metered
on credits is never picked for you. To name one yourself, set `spec_writer` in
`~/.agnostic/config.yaml`. If nothing on the machine qualifies, agn says so on the step and you
write the spec there.

Spec writing was verified with Claude Code. The headless flags for Codex, Pi and OpenCode follow
each vendor's documented headless form and have not been run here. If one of them rejects a flag,
report it; the flag will be dropped.

## After a task

`agn outcomes <task>` prints what one finished task cost and what became of it: how long the agent ran, its tokens and cost, the model it resolved to, the test results from before and after, how many lines it changed, and how many lines you changed afterwards. The verdict is `accepted` once the task's branch is merged into the base branch, by a merge commit or a squash; `reverted` once the branch is deleted or its worktree is removed without a merge; `not merged` until one of those happens. agn rechecks the open ones every five minutes and again whenever you ask for them, so a branch you merged a moment ago reads as accepted. A task that ran in a folder workspace has no branch of agn's, so its verdict and line counts print as `-`.

`agn stop` returns as soon as the agent is gone and finishes the task's accounting behind it: the usage scan, the repo's `test_command`, and the outcome row. An `agn outcomes` or `agn clean` run straight after a stop waits for that work, so it can take as long as your test command does. On a task adopted from a terminal of your own, stop ends that agent process too: SIGTERM first, then SIGKILL if it is still there five seconds later.

## Working on the workspace itself

From a checkout: `pnpm build` writes the page the daemon serves, and `pnpm dev` runs the daemon
and the Vite dev server together, with the page on `http://127.0.0.1:5173/ui/`.
