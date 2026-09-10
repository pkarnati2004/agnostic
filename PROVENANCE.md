# PROVENANCE

agnostic is MIT. Some code was copied or ported from other open projects.

## Rules

- **MIT or Apache 2.0 source** (Orca, Agent Deck): copy or port allowed. Keep the original notice in the file header. Add a row below.
- **ELv2 source** (Superset): read for ideas only. No code, comments, or fixtures copied.
- Every copied or ported file gets a row. Rows are never removed.

## Files

None yet. A row moves here from Planned when the file exists.

| Our file | From | License |
|---|---|---|

## Planned

Files we intend to copy or port. Names are provisional until the file lands.

| Our file | From | License |
|---|---|---|
| `packages/registry/src/harness-list.ts` | stablyai/orca `src/shared/tui-agent.ts`, `agent-kind.ts`, `agent-headless-command.ts`, `agent-cli-flag-detection.ts`, `agent-model-probe-spec.ts` | MIT © Lovecast Inc. |
| `packages/usage/src/parse-claude-transcript.ts` | asheshgoplani/agent-deck `internal/costs/parser_claude.go` (ported to TS) | MIT © Ashesh Goplani |
| `packages/usage/src/parse-openai-transcript.ts` | asheshgoplani/agent-deck `internal/costs/parser_openai.go` (ported) | MIT © Ashesh Goplani |
| `packages/usage/src/pricing.ts` | asheshgoplani/agent-deck `internal/costs/pricing.go` (ported) | MIT © Ashesh Goplani |
| `packages/usage/src/scan-claude-usage.ts` | stablyai/orca `src/main/claude-usage/` | MIT © Lovecast Inc. |
| `packages/ui/src/styles/tokens.css` | stablyai/orca `src/renderer/src/assets/main.css` (tokens only) | MIT © Lovecast Inc. |

## Ideas, no code

Superset (workspace layout, PTY daemon design), Orca (hook-based status), Agent Deck (tmux sessions, budgets, supervising agent), Omnigent (meta-harness framing).

## Catalog data

Benchmark rows cite source URL and date. Only aggregate scores are redistributed.
