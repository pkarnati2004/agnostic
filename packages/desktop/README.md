# @agnostic/desktop

The Mac app: one Electron window on the daemon's own workspace page. The app starts agnd from the
bundle `pnpm pack:npm` builds, under its own binary with `ELECTRON_RUN_AS_NODE`, so the machine
needs tmux but not Node. It reuses a daemon `agn` already started, and quitting leaves the daemon
running; "Quit and Stop Daemon" in the app menu ends it. The daemon gets the login shell's
environment, read once at app start. The app adds a native folder picker to Add repo and the New
task tab (`window.agnostic.pickFolder`) and the standard macOS menus.

It is not: state, an API or a second daemon. Everything the window shows comes from agnd. There
is no auto-update.

- `pnpm stage:desktop` builds the bundle and stages `packages/desktop/build/app`, with
  `better-sqlite3` and `node-pty` rebuilt for Electron. A rebuild with no prebuilt binary compiles
  from source, which needs the Xcode Command Line Tools and Python.
- `pnpm desktop` stages and opens the unpacked app.
- `pnpm build:desktop` stages and writes `agnostic.app`, a `.dmg` and a `.zip` to
  `packages/desktop/release/`, signed ad-hoc under the hardened runtime with `entitlements.plist`.
- `pnpm release:desktop` builds the same app signed with a Developer ID, notarized and stapled.
  [docs/release.md](../../docs/release.md) lists the variables it needs and the release steps.
- `pnpm smoke:desktop` runs the staged app against a temporary home; it opens a window.

`icon/icon.png` is rendered from `icon/icon.svg` with `qlmanage -t -s 1024 -o icon icon/icon.svg`
and is a placeholder until the release icon replaces it.
