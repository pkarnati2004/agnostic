#!/usr/bin/env bash
# The desktop app's daemon side, on a logged-in Mac: Electron needs the window server, so this
# opens a window for a few seconds. Not part of `pnpm smoke`. Stage first with `pnpm stage:desktop`.
# Quit a running agnostic app first: it holds the single-instance lock, and the launch below then
# exits at once and the wait for daemon.json times out.
# Usage: smoke-desktop.sh [app binary]  (default: the dev Electron on packages/desktop/build/app)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "$#" -gt 0 ]; then
  APP=("$@")
else
  APP=(packages/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron packages/desktop/build/app)
fi

echo "smoke-desktop: the staged app is there"
test -f packages/desktop/build/app/agnd/agnd.js
VERSION="$(node -p "require('./build/npm/package.json').version")"

AGNOSTIC_HOME="$(mktemp -d)"
TMUX_TMPDIR="$(mktemp -d /tmp/agn-desktop-XXXXXX)"
export AGNOSTIC_HOME TMUX_TMPDIR
FREE_PORT="$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>process.stdout.write(String(p)))})")"
# The daily catalog check is off so nothing the app starts leaves the machine.
printf 'port: %s\ncatalog_check: false\n' "$FREE_PORT" > "$AGNOSTIC_HOME/config.yaml"

APP_PID=""
cleanup() {
  [ -n "$APP_PID" ] && kill -TERM "$APP_PID" 2> /dev/null || true
  if [ -f "$AGNOSTIC_HOME/daemon.json" ]; then
    kill -TERM "$(node -p "require('$AGNOSTIC_HOME/daemon.json').pid")" 2> /dev/null || true
  fi
  # The socket under this run's TMUX_TMPDIR, named by path so no other agn server is touched.
  tmux -S "$TMUX_TMPDIR/tmux-$(id -u)/agn" kill-server 2> /dev/null || true
  rm -rf "$AGNOSTIC_HOME" "$TMUX_TMPDIR"
}
trap cleanup EXIT

echo "smoke-desktop: launch the app and wait for daemon.json"
"${APP[@]}" > /dev/null 2>&1 &
APP_PID=$!
for _ in $(seq 1 200); do
  [ -f "$AGNOSTIC_HOME/daemon.json" ] && break
  sleep 0.1
done
test -f "$AGNOSTIC_HOME/daemon.json"

echo "smoke-desktop: agnd runs the bundle under the app's binary on the configured port"
PID="$(node -p "require('$AGNOSTIC_HOME/daemon.json').pid")"
PORT="$(node -p "require('$AGNOSTIC_HOME/daemon.json').port")"
test "$PORT" = "$FREE_PORT"
ARGS="$(ps -o args= -p "$PID")"
echo "$ARGS" | grep -q 'agnd/agnd.js run'
echo "$ARGS" | grep -Eq '/(Electron|agnostic) '
if echo "$ARGS" | grep -Eq '(^|/)node '; then
  echo "smoke-desktop: agnd runs under node, not the app: $ARGS" >&2
  exit 1
fi

echo "smoke-desktop: /health reports $VERSION"
curl -fsS "http://127.0.0.1:$PORT/health" | grep -q "\"version\":\"$VERSION\""

echo "smoke-desktop: the window reached the tmux check"
for _ in $(seq 1 100); do
  grep -q "http POST /doctor" "$AGNOSTIC_HOME/logs/agnd.log" 2> /dev/null && break
  sleep 0.1
done
grep -q "http POST /doctor" "$AGNOSTIC_HOME/logs/agnd.log"
curl -fsS -H "Authorization: Bearer $(cat "$AGNOSTIC_HOME/auth-token")" -X POST \
  "http://127.0.0.1:$PORT/doctor" | grep -q '"tmux":{"version":"'

echo "smoke-desktop: quitting the app leaves the daemon running"
kill -TERM "$APP_PID"
wait "$APP_PID" || true
APP_PID=""
curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null

echo "smoke-desktop: SIGTERM stops the daemon"
kill -TERM "$PID"
for _ in $(seq 1 50); do
  curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null 2>&1 || break
  sleep 0.1
done
if curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then
  echo "smoke-desktop: agnd still answers after SIGTERM" >&2
  exit 1
fi

echo "smoke-desktop: ok"
