#!/usr/bin/env bash
# The TESTING.md smoke run for the current phase. Later chunks append their steps here.
set -euo pipefail

AGNOSTIC_HOME="$(mktemp -d)"
export AGNOSTIC_HOME
trap 'rm -rf "$AGNOSTIC_HOME"' EXIT

echo "smoke: core unit tests"
pnpm vitest run --project core

echo "smoke: ledger unit tests"
pnpm vitest run --project ledger

echo "smoke: registry unit tests"
pnpm vitest run --project registry

echo "smoke: daemon unit tests"
pnpm vitest run --project daemon

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
