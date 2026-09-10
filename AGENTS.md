# AGENTS.md

Guidance for coding agents working in this repo. Humans: see CONTRIBUTING.md.

- Read `CONTRIBUTING.md` and follow every rule there; CI enforces the mechanical ones.
- One package per concern under `packages/`; import other packages only via their `src/index.ts`.
- Shell out only through `packages/core/src/process.ts`.
- Don't add abstractions for a single use. Don't add dependencies without a reason in the PR.
- Run `pnpm lint && pnpm test` before declaring anything done. For behavior changes, extend `pnpm smoke`.
- Ask before: changing the SQLite schema, adding a daemon endpoint, adding any network call beyond localhost.
