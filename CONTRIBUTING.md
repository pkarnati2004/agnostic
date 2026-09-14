# Contributing

Thanks for looking. agnostic is MIT-licensed and small on purpose.

**Ground rules for code**
- TypeScript, strict. No `any` outside test fixtures, no `@ts-nocheck`.
- Files ≤ 300 lines, functions ≤ 60. Split by concept, not mechanically.
- Name files for what they contain. No `utils`, `helpers`, `common`.
- Comments explain *why*, briefly. No banner comments.
- No new dependency without a one-line reason in the PR.
- Every bug fix comes with a test that failed before the fix.

**Borrowed code.** Only from MIT/Apache sources, with the original notice kept and a row added to `PROVENANCE.md`. Ported code is rewritten in this repo's style with this repo's names, not transliterated; the row records where the knowledge came from. Please don't paste code from projects under other licenses.

**Building.** Each package exports source under the `development` condition and `dist/` otherwise, so vitest and `tsx` type-check and run the TypeScript directly while `pnpm build` and anything consuming a built package get `dist/`.

**Running the CLI.** `pnpm agn <args>` runs `agn` from source; pnpm passes the arguments through, so write flags as you would on the real command (`pnpm agn repos --json`). To put `agn` on your PATH from a checkout, run `pnpm build`, then `npm link` inside `packages/cli` (pnpm 12 has no global link; npm ships with Node 22).

**Workflow.** Branch per change, conventional commits, `pnpm lint && pnpm test` green. PR description: what, why, how tested.

**Adding a harness.** Add a `HarnessDefinition` in `packages/registry` (binary, detection, launch args, model override method) and, for full support, an `install.ts` and a `parse.ts` under `packages/hooks/src/<harness>/` with a row each in `harness-hooks.ts`, plus a transcript parser in `packages/usage`. Nothing else names a harness: the daemon asks the table.

**Adding catalog data.** Rows need a source URL, date, model version, harness, task class, metric, and score. See `docs/recommendations.md`.
