# Contributing

Thanks for looking. agnostic is MIT-licensed and small on purpose.

**Ground rules for code**
- TypeScript, strict. No `any` outside test fixtures, no `@ts-nocheck`.
- Files ≤ 300 lines, functions ≤ 60. Split by concept, not mechanically.
- Name files for what they contain. No `utils`, `helpers`, `common`.
- Comments explain *why*, briefly. No banner comments.
- No new dependency without a one-line reason in the PR.
- Every bug fix comes with a test that failed before the fix.

**Borrowed code.** Only from MIT/Apache sources, with the original notice kept and a row added to `PROVENANCE.md`. Please don't paste code from projects under other licenses.

**Building.** Each package exports source under the `development` condition and `dist/` otherwise, so vitest and `tsx` type-check and run the TypeScript directly while `pnpm build` and anything consuming a built package get `dist/`.

**Workflow.** Branch per change, conventional commits, `pnpm lint && pnpm test` green. PR description: what, why, how tested.

**Adding a harness.** Add a `HarnessDefinition` in `packages/registry` (binary, detection, launch args, model override method) and, for full support, a hook installer in `packages/hooks` plus a transcript parser in `packages/usage`.

**Adding catalog data.** Rows need a source URL, date, model version, harness, task class, metric, and score. See `docs/recommendations.md`.
