# Releasing

## npm package

The package on npm is one tarball: the `agn` command, the daemon and the workspace page bundled by `scripts/pack-npm.ts`, with `better-sqlite3` and `node-pty` as its only dependencies. Publishing is by hand.

1. On `main`, set `version` in `packages/cli/package.json` and commit it (`chore: release 0.1.0`).
2. `pnpm lint && pnpm test && pnpm smoke && pnpm smoke:npm` - the last one packs, installs the tarball into a temporary prefix and runs `agn --version`, `agn doctor` and the daemon from it.
3. `pnpm pack:npm` prints the tarball path, `build/npm/agnostic-dev-<version>.tgz`.
4. `npm publish build/npm/agnostic-dev-<version>.tgz` (`npm login` first; add `--tag next` for a pre-release so `npm i -g agnostic-dev` keeps the last stable one).
5. After the version commit has merged through a PR: `git tag v<version> && git push origin v<version>`.
6. Check: `npm view agnostic-dev version`, then on another machine `npm i -g agnostic-dev && agn --version`.

Other packages under `packages/` are `private` and are never published.

## Mac app

`pnpm release:desktop` builds `agnostic.app` signed with a Developer ID under the hardened runtime, has Apple notarize it, staples the ticket to it, and writes a `.dmg` and a `.zip` to `packages/desktop/release/`. Releasing is by hand, from one Mac.

One-time setup:

1. Join the Apple Developer Program.
2. Make a "Developer ID Application" certificate in Xcode → Settings → Accounts → Manage Certificates, or at developer.apple.com, and install it in the login keychain.
3. Store a notarytool login in the keychain: `xcrun notarytool store-credentials <profile-name>`. It asks for your Apple ID, an app-specific password (appleid.apple.com → Sign-In and Security → App-Specific Passwords) and your Team ID (developer.apple.com → Membership details).

The script reads these variables. Export them in the shell you release from, never in a shell rc file: `pnpm build:desktop` would otherwise try to notarize its ad-hoc build and fail.

| Variable | Used for |
|---|---|
| `CSC_NAME` | The signing identity: the text after `Developer ID Application: ` in `security find-identity -v -p codesigning`. electron-builder refuses the prefix itself. |
| `APPLE_KEYCHAIN_PROFILE` | The profile name given to `store-credentials`. notarytool reads the password from the keychain. |

Instead of `APPLE_KEYCHAIN_PROFILE`, you can export the login itself. notarytool then gets the password as a command-line argument, visible in `ps` while the submission runs. With both forms set, electron-builder uses this one.

| Variable | Used for |
|---|---|
| `APPLE_ID` | notarytool login: the Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | notarytool login: the app-specific password |
| `APPLE_TEAM_ID` | notarytool team: the Team ID under Membership details |

With CSC_NAME missing, or with neither the keychain profile nor the full Apple ID trio set, the script names what to set and builds nothing.

1. On `main`, after `pnpm lint && pnpm test && pnpm stage:desktop && pnpm smoke:desktop`, export the variables and run `pnpm release:desktop`. Notarization waits on Apple, usually one to five minutes.
2. The script verifies the signature, Gatekeeper's assessment and the stapled ticket, then prints the sha256 of the dmg and the zip and three steps:
   1. `git tag v<version> && git push origin v<version>`, or reuse a tag already pushed.
   2. Open `https://github.com/pkarnati2004/agnostic/releases/new?tag=v<version>`.
   3. Upload the dmg and the zip, then publish.
3. Check: open the dmg on a Mac that has never built agnostic; the app opens without a Gatekeeper warning.
