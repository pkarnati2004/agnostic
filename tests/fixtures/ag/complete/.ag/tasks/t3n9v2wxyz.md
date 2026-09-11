---
id: t3n9v2wxyz
title: "Recommend: rank profiles for a task"
status: waiting
profile: claude-code:sonnet-4.5:native
created: 2026-09-08T14:02:11.000Z
parent: q4m8n2vwxy
---

## Spec

Rank the available profiles for a task and explain the top choice in one line.

## Acceptance

`agn recommend "add oauth"` prints a recommendation, an alternative and a risk note.

## Notes

The catalog numbers came from the vendor pages on 2026-09-01. Re-check them before v1.

## Handoff to codex:default:native at 2026-09-09T09:30:00.000Z

### Goal

Review the scoring function against the catalog fixture.

### What failed

The speed preset never beat balanced on a short task, whatever the weights.

## Handoff to claude-code:default:native at 2026-09-10T11:15:00.000Z

### Goal

Apply the review comments and re-run the scoring tests.
