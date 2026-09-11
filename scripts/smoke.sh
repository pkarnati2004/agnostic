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
