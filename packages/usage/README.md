# @agnostic/usage

What a coding agent spent, read from the transcript files it writes on this machine.

- One parser per harness (`claude-code`, `codex`), each turning a `.jsonl` transcript into
  `TranscriptTurn`s with the four token buckets and a stable `ref`. The ref is what makes a rescan
  and a forked or resumed session insert each turn exactly once.
- `scanTranscripts` walks the transcript roots it is given, skips files whose size and mtime have
  not changed since the last scan, and reports an unreadable file as a problem rather than failing
  the scan.
- `attributeTurns` decides which task a turn belongs to: the harness session id first, then the
  working directory inside the task's own window. Turns that match nothing stay unattributed.
- `pricingRow`, `priceTokens` and `costForTurn` price a turn from the catalog's pricing rows. A
  model with no row, and a cache bucket with no rate, price as null rather than as zero.
- `usageWindow` and `summarizePlans` build the local calendar day and week and group a window's
  rows per harness, with the plan's label and the Fable share.

It is not: HTTP, the ledger, the catalog's rows or their refresh, budgets. Nothing here shells out
or reaches the network; it reads the files the harnesses already wrote.
