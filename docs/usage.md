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
