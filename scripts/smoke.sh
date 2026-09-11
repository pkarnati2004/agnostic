#!/usr/bin/env bash
# The TESTING.md smoke run for the current phase. Later chunks append their steps here.
set -euo pipefail

AGNOSTIC_HOME="$(mktemp -d)"
export AGNOSTIC_HOME
WORK="$(mktemp -d)"
trap 'rm -rf "$AGNOSTIC_HOME" "$WORK"' EXIT

echo "smoke: core unit tests"
pnpm vitest run --project core

echo "smoke: ledger unit tests"
pnpm vitest run --project ledger

echo "smoke: registry unit tests"
pnpm vitest run --project registry

echo "smoke: daemon unit tests"
pnpm vitest run --project daemon

echo "smoke: cli unit tests"
pnpm vitest run --project cli

echo "smoke: agnd start/status/stop round trip"
# PATH holds node's bin dir only, so detection finds no harness and no probe runs a real CLI.
AGND=(node --import tsx packages/daemon/src/main.ts)
PATH="$(dirname "$(command -v node)")" "${AGND[@]}" start --port 0
PATH="$(dirname "$(command -v node)")" "${AGND[@]}" status
test -f "$AGNOSTIC_HOME/daemon.json"
test -f "$AGNOSTIC_HOME/logs/agnd.log"

PORT="$(node -e "process.stdout.write(String(require('$AGNOSTIC_HOME/daemon.json').port))")"
TOKEN="$(cat "$AGNOSTIC_HOME/auth-token")"
curl -fsS "http://127.0.0.1:$PORT/health" > /dev/null
curl -fsS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/repos" > /dev/null
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/doctor" > /dev/null

PATH="$(dirname "$(command -v node)")" "${AGND[@]}" stop
test ! -f "$AGNOSTIC_HOME/daemon.json"

echo "smoke: agn round trip, from no daemon to two registered repos"
# The CLI runs from source like agnd above. Each agn call sees an empty PATH, so the daemon it
# starts detects no harness and probes no real CLI; node itself is found by its absolute path.
NODE="$(command -v node)"
EMPTY="$AGNOSTIC_HOME/empty-bin"
mkdir -p "$EMPTY"
agn() {
  PATH="$EMPTY" "$NODE" --import tsx --conditions development packages/cli/src/main.ts "$@"
}
# A port nothing is listening on, so a daemon the author is already running keeps its own. The
# CLI never reads this file: it learns the port from the daemon.json that agnd writes.
FREE_PORT="$("$NODE" -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>process.stdout.write(String(p)))})")"
printf 'port: %s\n' "$FREE_PORT" > "$AGNOSTIC_HOME/config.yaml"

! agn daemon status
agn repos | grep -q "^no repos yet"
agn daemon status | grep -q "^running"

mkdir -p "$WORK/gitrepo" "$WORK/plain"
git -C "$WORK/gitrepo" init -q
agn add "$WORK/gitrepo" | grep -q "^added gitrepo (git) "
agn add "$WORK/plain" | grep -q "^added plain (folder) "
test "$(agn repos | wc -l)" -eq 3
agn repos --json > "$WORK/repos.json"
"$NODE" -e "const { repos } = require('$WORK/repos.json'); if (repos.length !== 2) { throw new Error('expected two repos'); }"

test "$(agn doctor | grep -c "not installed")" -eq 4
test "$(agn profiles | wc -l)" -eq 2

! agn add "$WORK/nope" 2> "$WORK/add-error.txt"
grep -q "does not exist" "$WORK/add-error.txt"
! agn add "$WORK/nope" --json 2> "$WORK/add-error.json"
grep -q '"code":"path-not-found"' "$WORK/add-error.json"

agn daemon stop | grep -q "^agnd stopped"
! agn daemon status
