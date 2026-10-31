#!/usr/bin/env bash
# Packs the npm tarball, installs it into a temporary prefix and runs agn from there. Apart from
# `pnpm smoke` because `npm install` fetches better-sqlite3 and node-pty from the registry.
set -euo pipefail

echo "smoke-npm: pack the tarball"
TGZ="$(pnpm pack:npm | tail -n 1)"
echo "smoke-npm: $TGZ"
test -f "$TGZ"

echo "smoke-npm: the tarball holds the bundles, the catalog and the page, and no source"
LISTING="$(tar tzf "$TGZ")"
for file in package/dist/main.js package/dist/agnd.js package/dist/catalog.json package/dist/ui/index.html; do
  grep -qx "$file" <<< "$LISTING"
done
grep -q '^package/dist/ui/assets/.*\.woff2$' <<< "$LISTING"
if grep -E 'package/src/|\.map$|\.test\.|\.d\.ts$' <<< "$LISTING"; then
  echo "the tarball carries files it should not" >&2
  exit 1
fi

echo "smoke-npm: the manifest names only the native dependencies"
MANIFEST="$(tar xzf "$TGZ" -O package/package.json)"
if grep -q 'workspace:' <<< "$MANIFEST"; then
  echo "the published manifest still has a workspace: range" >&2
  exit 1
fi
VERSION="$(node -p "require('./packages/cli/package.json').version")"
node -e '
const m = JSON.parse(process.argv[1]);
const deps = JSON.stringify(Object.keys(m.dependencies).sort());
if (m.version !== process.argv[2]) throw new Error(`version ${m.version}, expected ${process.argv[2]}`);
if (m.bin.agn.replace(/^\.\//, "") !== "dist/main.js") throw new Error(`bin.agn is ${m.bin.agn}`);
if (deps !== JSON.stringify(["better-sqlite3", "node-pty"])) throw new Error(`dependencies ${deps}`);
' "$MANIFEST" "$VERSION"

# Declared empty and trapped before any mktemp, so a failure while creating them leaks nothing.
PREFIX="" SMOKE_HOME="" AGNOSTIC_HOME="" TMUX_TMPDIR="" WORK="" NODE_ONLY=""

agn() {
  HOME="$SMOKE_HOME" AGNOSTIC_HOME="$AGNOSTIC_HOME" TMUX_TMPDIR="$TMUX_TMPDIR" \
    PATH="$PREFIX/bin:$NODE_ONLY" "$PREFIX/bin/agn" "$@"
}

cleanup() {
  if [ -n "$PREFIX" ] && [ -x "$PREFIX/bin/agn" ]; then
    agn daemon stop > /dev/null 2>&1 || true
  fi
  if [ -n "$TMUX_TMPDIR" ]; then
    TMUX_TMPDIR="$TMUX_TMPDIR" tmux -L agn kill-server > /dev/null 2>&1 || true
  fi
  for dir in "$PREFIX" "$SMOKE_HOME" "$AGNOSTIC_HOME" "$TMUX_TMPDIR" "$WORK" "$NODE_ONLY"; do
    if [ -n "$dir" ]; then rm -rf "$dir"; fi
  done
}
trap cleanup EXIT

PREFIX="$(mktemp -d)"
SMOKE_HOME="$(mktemp -d)"
AGNOSTIC_HOME="$(mktemp -d)"
TMUX_TMPDIR="$(mktemp -d /tmp/agn-npm-XXXXXX)"
WORK="$(mktemp -d)"
# node alone, not its bin directory: a harness installed with `npm i -g` sits beside node there,
# and detection would find it and probe the real CLI.
NODE_ONLY="$(mktemp -d)"
ln -s "$(command -v node)" "$NODE_ONLY/node"

echo "smoke-npm: npm install -g into a temporary prefix"
npm install -g --prefix "$PREFIX" --no-fund --no-audit "$TGZ" > /dev/null
test -x "$PREFIX/bin/agn"

FREE_PORT="$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>process.stdout.write(String(p)))})")"
# The daily catalog check is off so the smoke never leaves the machine once agn runs.
printf 'port: %s\ncatalog_check: false\n' "$FREE_PORT" > "$AGNOSTIC_HOME/config.yaml"

echo "smoke-npm: agn --version is $VERSION"
test "$(agn --version)" = "$VERSION"

echo "smoke-npm: agn doctor lists the harnesses and the tools, starting the daemon"
agn doctor > "$WORK/doctor.txt"
grep -q "^not installed: claude-code, codex, " "$WORK/doctor.txt"
grep -q "^tools: gh" "$WORK/doctor.txt"

echo "smoke-npm: the daemon runs from the installed bundle on the configured port"
PID="$(node -p "require('$AGNOSTIC_HOME/daemon.json').pid")"
PORT="$(node -p "require('$AGNOSTIC_HOME/daemon.json').port")"
ps -o args= -p "$PID" | grep -qF "$PREFIX/lib/node_modules/agnostic-dev/dist/agnd.js"
test "$PORT" = "$FREE_PORT"

echo "smoke-npm: /health reports $VERSION"
curl -fsS "http://127.0.0.1:$PORT/health" | grep -q "\"version\":\"$VERSION\""

echo "smoke-npm: /ui serves the installed page and its fonts"
curl -fsS "http://127.0.0.1:$PORT/ui" | grep -q 'id="root"'
FONT="$(basename "$(ls "$PREFIX/lib/node_modules/agnostic-dev/dist/ui/assets/"*.woff2 | head -1)")"
curl -fsS -D "$WORK/font.h" -o /dev/null "http://127.0.0.1:$PORT/ui/assets/$FONT"
grep -qi "^content-type: font/woff2" "$WORK/font.h"

echo "smoke-npm: the catalog is the bundled snapshot"
agn catalog show claude-code:opus:native > "$WORK/catalog.txt"
head -1 "$WORK/catalog.txt" | grep -q "(bundled, generated "

echo "smoke-npm: agn daemon stop"
agn daemon stop > "$WORK/stop.txt"
grep -q "^agnd stopped" "$WORK/stop.txt"
test ! -f "$AGNOSTIC_HOME/daemon.json"

echo "smoke-npm: ok"
