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
- `pnpm build:desktop` stages and writes an unsigned, ad-hoc signed `agnostic.app` and `.dmg` to
  `packages/desktop/release/`.
- `pnpm smoke:desktop` runs the staged app against a temporary home; it opens a window.

`icon/icon.png` is rendered from `icon/icon.svg` with `qlmanage -t -s 1024 -o icon icon/icon.svg`
and is a placeholder until the release icon replaces it.
