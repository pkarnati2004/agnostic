# Usage and cost

`agn usage` shows today's and this week's tokens for each agent, with the plan they are billed on.
`agn usage <task>` shows one task's tokens and what they cost.

```
agn usage
agn usage t3n9v2wxyz
agn usage --json
```

## Where the numbers come from

Agents write a transcript of every session on your machine: Claude Code under `~/.claude/projects`,
Codex under `~/.codex/sessions`. agn reads those files, counts the tokens each turn reported, and
stores one row per turn. Nothing is sent anywhere, and nothing is estimated.

The files are read when you ask for usage and once when a task closes. A file agn has already read
is not opened again unless its size or its modification time changed. On a machine with a long
history, the first read covers the last two weeks.

Writing a spec runs one of your agents, so its tokens are counted the same way: as a session agn
did not start, on the plan's total and on no task.

Sessions you started yourself, outside agn, are counted too: they are on the same plan and the
vendor meters them the same way. They appear in the per-plan totals and never on a task. Codex
Desktop sessions are the exception: they report a total with no per-bucket split, so they do not
appear in `agn usage` at all, while Codex CLI sessions do.

## Windows

"Today" is the calendar day in your own time zone. "This week" starts on Monday. The vendors meter
their subscription limits over rolling windows of their own - five hours, seven days - so the
percentages Claude Code or Codex show you will not match these totals. They are counting a
different window, not different tokens.

## Limits

Some agents write what their vendor's meter says into a file on your machine. agn reads those
files and shows the percentage of the plan's rolling windows that is spent. agn calls no vendor
endpoint for this, and there is nothing to configure.

| Agent | What this machine has |
| --- | --- |
| Codex CLI | Every rollout under `~/.codex/sessions` records the 5-hour and weekly percentages. agn reads them in the same pass that counts its tokens. |
| Claude Code | The percentages arrive on the status line, not in a file. agn captures them (below). |
| Gemini, Grok, Kimi, Cursor | Login and plan only. Tokens and cost. |
| Pi, OpenCode | Billed per provider key, so there is no plan limit. Tokens and cost. |

A figure has one of three states, and both `agn usage` and the usage bar work them out from the
time the agent reported it:

| State | When | How it reads |
| --- | --- | --- |
| Current | The window has not reset and the figure is under two hours old. | `58%` |
| Approximate | The window has not reset and the figure is two hours old or more. | `~58%`, dimmed in the bar |
| Stale | The window has reset, or the agent reported no reset time and the figure is an hour old. | `–` in the bar, left out of `agn usage` |

The percentages are your account's, not this machine's or this task's. A session you ran outside
agn moves them, and agn sees the new figure the next time one of these files is written. That is
why a figure older than two hours is marked: your usage elsewhere has had time to move it.

Nothing agn does acts on an approximate figure. Both `agn usage` and the bar say how old the
figure is, so you can decide for yourself.

### How agn captures Claude Code's figures

Claude Code sends the percentages to the `statusLine` command it runs every turn. agn installs a
command of its own in `~/.claude/settings.json`, the file Claude Code reads for every session, at
when a task starts and on `agn hooks install`. The command writes the payload to
`~/.agnostic/rate-limits/claude-code.json`, at most once every 15 seconds, and carries no token.

- Every Claude Code session on this machine then reports, whether or not agn started it. One
  session reporting is enough: the figures are the plan's, not the session's.
- A status line you already had keeps drawing. agn's command runs it on the same payload and
  prints what it prints, and your other `statusLine` keys stay as they are. The entry agn replaced
  is kept in `~/.agnostic/hooks/claude-statusline-original.json`.
- agn also keeps its entry in the `.claude/settings.local.json` it writes for hooks, in each
  checkout and each task worktree. That entry wins inside an agn worktree, and it runs the same
  command, so one of the two reports per session.
- `hooks: {claude_statusline: repo}` in `~/.agnostic/config.yaml` keeps agn out of
  `~/.claude/settings.json`. The next task launch or `agn hooks install` puts your own entry back
  and captures only the sessions agn starts.
- A status line of your own in a repo's `.claude/settings.local.json` is left alone. agn captures
  no figures for that repo and `agn hooks install` says so under `verify`.
- `agn doctor` prints `claude-code status-line capture:` with `all sessions`, `agn tasks only` or
  `none yet`.

### `agn usage`

Under the two tables, `agn usage` prints one line per agent whose figures still hold:

```
claude-code  58% of the 5-hour window (resets 14:05) · 41% of the week (resets Mon 09:00) · as of 12 min ago
codex  ~1% of the 5-hour window (resets 15:00) · ~17% of the week (resets Sun 02:00) · as of 3 h ago
```

The tilde marks an approximate figure. `as of` is the age of the whole line: the agent reports both
windows at once.

## Cost

A model that runs on your subscription costs nothing per token, so the task view says
`included in plan` and the per-plan table prints `-` in the cost column.

A model that runs on an API key, on credits, or on a login agn cannot classify is priced from the
catalog's rates for that model, per bucket: input, output, cache read, cache write.

A number is `-` when agn will not guess:

- no pricing row for the model the agent reported;
- a run on a plan, where the cost is the subscription and not the tokens;
- a bucket the agent does not report at all. Codex reports no cache-write bucket, so that column
  stays empty for it.

Usage that no task owns is never priced: agn does not know which key or plan paid for it.

For a plan you pay a subscription for, the workspace also shows what the week's tokens would have
cost at the catalog's API rates: `≈ $12.40 at API rates, not billed`. It is a comparison, not a
bill. Nothing is charged, and the figure is missing when any model in the window has no pricing
row. `agn usage --json` carries it per plan as `apiRateUsd`.

## Budgets

A budget is a ceiling in dollars over what agn priced in a window. Set one in
`~/.agnostic/config.yaml`:

```yaml
budget:
  daily_usd: 5
  weekly_usd: 20
```

Either key on its own is enough. The windows are the ones above: the calendar day and the
Monday-based week, in your own time zone.

The budget counts the runs you pay for by the token: API-key and credits runs, and a run whose
billing agn could not determine, which is priced like a key so that a cost agn cannot rule out is
still shown. Subscription and local runs are never counted.

At 80% of a ceiling, `agn run`, the new-task dialog and the usage bar warn. `agn usage` prints a
line per window under the tables:

```
budget today $4.10 of $5.00 (82%, warn)
budget this week $18.40 of $20.00 (92%, warn)
```

At 100%, a run or a handoff onto an API-key or credits profile is refused:

```
agn: today's priced spend is $5.12, over the $5.00 daily budget
  hint: Pass --ignore-budget to run this task anyway, or raise budget.daily_usd in ~/.agnostic/config.yaml.
```

The warning is advisory: `agn run` prints it from the same figures `agn usage` shows, and it prints
nothing if it cannot read them. The refusal at 100% is the daemon's, and it happens whether or not
the warning was printed.

`agn run --ignore-budget` and `agn handoff --ignore-budget` start the task anyway, for that one
task. In the workspace, the note under the Profile select carries the same override as a checkbox.

Resume is never refused: work that has already started always continues. A subscription task is
unaffected at any spend.
