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
| `packages/registry/src/harness-list.ts`, `harness-list-families.ts`, `harness-list-tier2.ts`, with the flag knowledge they feed `gateways.ts` and `launch.ts` | stablyai/orca `src/shared/tui-agent.ts`, `tui-agent-config.ts`, `tui-agent-detection-commands.ts`, `agent-session-resume.ts`, `agent-session-option-catalog-claude-codex.ts`, `agent-model-probe-spec.ts`, `agent-process-recognition.ts`, `agent-node-entrypoint-identities.ts`, `commit-message-agent-specs-primary.ts` (agent rows, launch flags, the headless argv each CLI takes for one read-only answer on stdin, and the resume argv per harness; ported, the resume column on 2026-09-21) | MIT © Lovecast Inc. |
| `packages/executor-tmux/src/tmux-client.ts`, `stop.ts` (and the behaviour they encode in `launch.ts`) | asheshgoplani/agent-deck `internal/tmux/tmux.go`, `socket.go`, `default_socket_guard.go`, `workdir_guard.go`, `initialsize.go`, `version_warning.go`, `ensure_pids_dead.go`, `canonical_line.go`, `keysender.go` (tmux argv rules, version floor, paste transport, kill escalation, test isolation; ported) | MIT © Ashesh Goplani |
| `packages/hooks/src/codex/trust.ts` (the trust key format, the snake_case event labels and the hashed handler definition) | stablyai/orca `src/main/codex/codex-hook-identity.ts`, `codex-trust-identity.ts`, `codex-hook-definition.ts`, `codex-hook-local-install.ts` (ported) | MIT © Lovecast Inc. |
| `packages/hooks/src/claude-code/parse.ts`, `packages/hooks/src/codex/parse.ts` (which hook event means working and which means waiting), and the one-script hook transport in `hook-script.ts` | stablyai/orca `src/shared/agent-hook-listener.ts`, `agent-hook-listener/providers/claude-events.ts`, `codex-events.ts`, `hook-envelope.ts`; `src/main/claude/hook-settings.ts`, `hook-service.ts`; `src/main/agent-hooks/hook-post-command.ts`, `hook-stdin-contract.ts`, `posix-hook-command.ts` (ported from a behaviour list, not copied) | MIT © Lovecast Inc. |
| `packages/registry/src/model-list-parsers.ts`, `probe-models.ts` | stablyai/orca `src/shared/claude-model-list-probe.ts`, `commit-message-model-parsers.ts` (`parseCursorModels`, 2026-09-21), `grok-model-list-probe.ts` (the `grok models` listing: the header, the two bullets, the blank line that ends the section; row extended 2026-09-21); `src/main/text-generation/commit-message-model-discovery.ts`, `commit-message-model-discovery-policy.ts` (ported) | MIT © Lovecast Inc. |
| `packages/hooks/src/settings-json/*.ts` (the events each harness installs, its config layout and timeout unit, and which event means running or waiting), with the payload fixtures under `tests/fixtures/hooks/payloads/` | stablyai/orca `src/main/{claude/hook-settings,gemini/hook-service,droid/hook-service,cursor/hook-service,cursor/hook-events,kimi/hook-service,devin/hook-service,devin/hook-settings,devin/hook-config-json,openclaude/hook-service,command-code/hook-service}.ts`; `src/shared/agent-hook-listener/providers/{gemini,droid,cursor,kimi,devin,command-code}-events.ts`, `droid-tool-fields.ts`; the fixtures transcribed from `src/main/agent-hooks/server-{gemini,droid}-normalization.test.ts` and `src/shared/agent-hook-listener-{claude-compatible-vendors,interactive-prompts,command-code-transcript}.test.ts` (ported from a behaviour list, not copied) | MIT © Lovecast Inc. |
| `packages/hooks/src/hooks-toml-file.ts` (the `[[hooks]]` block at the end of a TOML config, and the basic-string escape its command needs) | stablyai/orca `src/main/kimi/kimi-hook-config-toml.ts` (ported; the orphaned-block recovery was dropped for a refusal) | MIT © Lovecast Inc. |
| `packages/hooks/src/hooks-dir/install.ts`, `grok.ts`, `copilot.ts` (the event lists, the tool matcher, the two status tables, and the Copilot file shape: `version: 1`, `bash`, `timeoutSec`, the `{}` reply) and the Grok payload fixtures under `tests/fixtures/hooks/payloads/grok/` | stablyai/orca `src/main/grok/grok-hook-config.ts`, `hook-service.ts`; `src/main/copilot/copilot-managed-hook-definitions.ts`, `copilot-managed-script.ts`, `hook-service.ts`; `src/shared/agent-hook-listener/providers/grok-events.ts`, `grok-tool-fields.ts`, `copilot-events.ts`, `copilot-tool-fields.ts`, `provider-event-names.ts`; the fixtures from `src/shared/agent-hook-listener-grok.test.ts` (ported from a behaviour list, not copied) | MIT © Lovecast Inc. |
| `packages/hooks/src/pi/extension-source.ts`, `pi/parse.ts`, `hook-post-source.ts`, `managed-file.ts`, and the payload fixtures `tests/fixtures/hooks/payloads/{pi,omp}/` (the extension agn writes into Pi's own extension directory, its owner guard, the three turn rules, the latest-only post queue, the marker that says a file is agn's, and which event means waiting) | stablyai/orca `src/main/pi/agent-status-extension-source.ts`, `agent-status-handler-source.ts`, `agent-status-ui-prompt-source.ts`, `titlebar-extension-service.ts`; `src/shared/agent-hook-listener/providers/pi-family-events.ts` (ported from a behaviour list, not copied) | MIT © Lovecast Inc. |
| `packages/hooks/src/opencode/plugin-source.ts`, `opencode/parse.ts`, and the payload fixtures `tests/fixtures/hooks/payloads/{opencode,mimo-code}/` and `opencode/sdk/` (the plugin module shape OpenCode's two loaders accept, the undefined-context rule, the root-session filter, the closing idle, and the event table) | stablyai/orca `src/main/opencode/hook-service.ts`, `status-plugin-factory-source.ts`, `status-plugin-lifecycle-source.ts`, `status-plugin-post-source.ts`, `status-plugin-endpoint-source.ts`; `src/main/mimo/hook-service.ts`; `src/shared/agent-hook-listener/providers/opencode-family-events.ts` (ported) | MIT © Lovecast Inc. |
| `packages/registry/src/detect-login.ts`, `grok-auth-file.ts`, `detect-plan.ts` (the four vendors' auth file paths and field names, xAI's issuer selection with its expiry skew, and the rule that a token-less Grok file means signed out) | stablyai/orca `src/main/rate-limits/gemini-oauth-sources.ts` (`readGeminiCredentials`), `grok-auth.ts`, `kimi-fetcher.ts`, and the fixtures transcribed from `grok-auth.test.ts` (ported from a behaviour list, not copied; the quota fetchers in those files were not read past the point where the file is parsed, and agn makes no such call) | MIT © Lovecast Inc. |
| `packages/usage/src/pi/parse.ts`, `usage/src/opencode/parse.ts`, `opencode/rows.ts` (the message-graph record shapes, the per-message row queries and the bucket split, with cached input capped at input) | stablyai/orca `src/main/ai-vault/session-scanner-graph-parsers.ts`, `session-scanner-token-values.ts`, `session-scanner-test-fixtures.ts`; `src/main/opencode-usage/opencode-database-discovery.ts`, `opencode-usage-row-queries.ts`, `opencode-usage-row-parsing.ts` (ported) | MIT © Lovecast Inc. |
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
| `plans`, `entitlements` | The Claude plan comparison and the Codex plans and usage page; the Google AI plans page, the Grok plans page, the Kimi Code membership page and the Cursor pricing page (`plans` rows only, recorded 2026-09-21 from the vendor survey and marked provisional in each `sources` row until re-read) |
| `pricing` | The public OpenRouter model list |
