# PROVENANCE

agnostic is MIT. Some code was copied or ported from other open projects.

## Rules

- **MIT or Apache 2.0 source** (Orca, Agent Deck): copy or port allowed. Keep the original notice in the file header. Add a row below. A row records where the knowledge came from; ported files are written in this repo's style and naming, not copied word for word.
- **ELv2 source** (Superset): read for ideas only. No code, comments, or fixtures copied.
- Every copied or ported file gets a row. Rows are never removed.

## Files

A row moves here from Planned when the file exists.

| Our file | From | License |
|---|---|---|
| `packages/registry/src/harness-list.ts`, with the flag knowledge it feeds `gateways.ts` and `launch.ts` | stablyai/orca `src/shared/tui-agent.ts`, `tui-agent-config.ts`, `tui-agent-detection-commands.ts`, `agent-session-resume.ts`, `agent-session-option-catalog-claude-codex.ts`, `agent-process-recognition.ts`, `agent-node-entrypoint-identities.ts`, `commit-message-agent-specs-primary.ts` (agent rows and flags, ported) | MIT © Lovecast Inc. |
| `packages/executor-tmux/src/tmux-client.ts`, `stop.ts` (and the behaviour they encode in `launch.ts`) | asheshgoplani/agent-deck `internal/tmux/tmux.go`, `socket.go`, `default_socket_guard.go`, `workdir_guard.go`, `initialsize.go`, `version_warning.go`, `ensure_pids_dead.go`, `canonical_line.go`, `keysender.go` (tmux argv rules, version floor, paste transport, kill escalation, test isolation; ported) | MIT © Ashesh Goplani |
| `packages/registry/src/model-list-parsers.ts`, `probe-models.ts` | stablyai/orca `src/shared/claude-model-list-probe.ts`, `commit-message-model-parsers.ts`; `src/main/text-generation/commit-message-model-discovery.ts`, `commit-message-model-discovery-policy.ts` (ported) | MIT © Lovecast Inc. |

## Planned

Files we intend to copy or port. Names are provisional until the file lands.

| Our file | From | License |
|---|---|---|
| `packages/usage/src/parse-claude-transcript.ts` | asheshgoplani/agent-deck `internal/costs/parser_claude.go` (ported to TS) | MIT © Ashesh Goplani |
| `packages/usage/src/parse-openai-transcript.ts` | asheshgoplani/agent-deck `internal/costs/parser_openai.go` (ported) | MIT © Ashesh Goplani |
| `packages/usage/src/pricing.ts` | asheshgoplani/agent-deck `internal/costs/pricing.go` (ported) | MIT © Ashesh Goplani |
| `packages/usage/src/scan-claude-usage.ts` | stablyai/orca `src/main/claude-usage/` | MIT © Lovecast Inc. |
| `packages/ui/src/styles/tokens.css` | stablyai/orca `src/renderer/src/assets/main.css` (tokens only) | MIT © Lovecast Inc. |

## Ideas, no code

Superset (workspace layout, PTY daemon design), Orca (hook-based status), Agent Deck (tmux sessions, budgets, supervising agent), Omnigent (meta-harness framing).

## Catalog data

Benchmark rows cite source URL and date. Only aggregate scores are redistributed.
