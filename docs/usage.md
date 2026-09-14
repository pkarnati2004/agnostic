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
