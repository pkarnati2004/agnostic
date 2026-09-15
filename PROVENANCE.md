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
| `packages/hooks/src/codex/trust.ts` (the trust key format, the snake_case event labels and the hashed handler definition) | stablyai/orca `src/main/codex/codex-hook-identity.ts`, `codex-trust-identity.ts`, `codex-hook-definition.ts`, `codex-hook-local-install.ts` (ported) | MIT © Lovecast Inc. |
| `packages/hooks/src/claude-code/parse.ts`, `packages/hooks/src/codex/parse.ts` (which hook event means working and which means waiting), and the one-script hook transport in `hook-script.ts` | stablyai/orca `src/shared/agent-hook-listener.ts`, `agent-hook-listener/providers/claude-events.ts`, `codex-events.ts`, `hook-envelope.ts`; `src/main/claude/hook-settings.ts`, `hook-service.ts`; `src/main/agent-hooks/hook-post-command.ts`, `hook-stdin-contract.ts`, `posix-hook-command.ts` (ported from a behaviour list, not copied) | MIT © Lovecast Inc. |
| `packages/registry/src/model-list-parsers.ts`, `probe-models.ts` | stablyai/orca `src/shared/claude-model-list-probe.ts`, `commit-message-model-parsers.ts`; `src/main/text-generation/commit-message-model-discovery.ts`, `commit-message-model-discovery-policy.ts` (ported) | MIT © Lovecast Inc. |
| `packages/usage/src/claude-code/parse.ts`, `scan-transcripts.ts` (the assistant-record shape, the prefilter, the dedupe key and max-per-bucket merge, the `*.jsonl` walk and the size-and-mtime skip) | stablyai/orca `src/main/claude-usage/transcript-record-parser.ts`, `transcript-file-discovery.ts`, `scanner.ts` (ported) | MIT © Lovecast Inc. |
| `packages/usage/src/pricing.ts` (the logic only: the `-YYYYMMDD` normalisation and the per-bucket cost sum; the rates are catalog data, ADR 011) | asheshgoplani/agent-deck `internal/costs/pricing.go` (ported) | MIT © Ashesh Goplani |
| `packages/ui/src/styles/tokens.css` (the shadcn set, the sidebar family, the radius scale and the agent-question hue; the families agn has no surface for were dropped) | stablyai/orca `src/renderer/src/assets/main.css` lines 130-366 (copied) | MIT © Lovecast Inc. |
| `packages/ui/src/components/button.tsx`, `badge.tsx`, `dialog.tsx`, `select.tsx`, `tooltip.tsx` (copied, with the variant tables as plain records instead of class-variance-authority and only the parts the workspace uses) | shadcn-ui/ui `apps/v4/registry/new-york-v4/ui/button.tsx`, `badge.tsx`, `dialog.tsx`, `select.tsx`, `tooltip.tsx` | MIT © shadcn |

## Planned

Files we intend to copy or port. Names are provisional until the file lands. Nothing is pending.

## Ideas, no code

Superset (workspace layout, PTY daemon design), Orca (hook-based status), Agent Deck (tmux sessions, budgets, supervising agent), Omnigent (meta-harness framing).

## Catalog data

`packages/catalog/src/catalog.json` is transcribed by hand. Its `sources` table carries one row per
place a number came from, with the URL, the terms it is published under, and the date it was read;
every benchmark row names the source it came from, and every plan and entitlement row the vendor
page it was confirmed against. Only aggregate scores are redistributed: no task, no trajectory, and
no code from any benchmark repository.

| Table | Sources as of 2026-09-12 |
|---|---|
| `benchmarks` | Terminal-Bench 4.0 leaderboard; SWE-bench Verified and Multilingual leaderboards; SWE-Bench Pro (public) leaderboard; LiveBench 2026-06-25; Red Hat `coding_agent_bench` README tables; OpenBench harness bench |
| `plans`, `entitlements` | The Claude plan comparison and the Codex plans and usage page |
| `pricing` | The public OpenRouter model list |
