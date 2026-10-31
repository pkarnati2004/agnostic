# Releasing agnostic-dev

The package on npm is one tarball: the `agn` command, the daemon and the workspace page bundled by `scripts/pack-npm.ts`, with `better-sqlite3` and `node-pty` as its only dependencies. Publishing is by hand.

1. On `main`, set `version` in `packages/cli/package.json` and commit it (`chore: release 0.1.0`).
2. `pnpm lint && pnpm test && pnpm smoke && pnpm smoke:npm` - the last one packs, installs the tarball into a temporary prefix and runs `agn --version`, `agn doctor` and the daemon from it.
3. `pnpm pack:npm` prints the tarball path, `build/npm/agnostic-dev-<version>.tgz`.
4. `npm publish build/npm/agnostic-dev-<version>.tgz` (`npm login` first; add `--tag next` for a pre-release so `npm i -g agnostic-dev` keeps the last stable one).
5. After the version commit has merged through a PR: `git tag v<version> && git push origin v<version>`.
6. Check: `npm view agnostic-dev version`, then on another machine `npm i -g agnostic-dev && agn --version`.

Other packages under `packages/` are `private` and are never published.
