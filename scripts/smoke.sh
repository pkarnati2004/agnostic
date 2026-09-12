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

echo "smoke: executor-tmux against a real tmux on a private socket"
command -v tmux > /dev/null || {
  echo "tmux is not installed: brew install tmux (macOS) or apt install tmux (Linux)" >&2
  exit 1
}
TMUX_VERSION="$(tmux -V | awk '{print $2}')"
case "$TMUX_VERSION" in
  next | master) ;;
  *)
    TMUX_MINOR="${TMUX_VERSION#*.}"
    if [ "${TMUX_VERSION%%.*}" -lt 3 ] ||
      { [ "${TMUX_VERSION%%.*}" -eq 3 ] && [ "${TMUX_MINOR%%[!0-9]*}" -lt 2 ]; }; then
      echo "agn needs tmux 3.2 or newer, found $TMUX_VERSION" >&2
      exit 1
    fi
    ;;
esac
# The integration tests are the smoke: they launch the fake agent under tmux, check it is alive,
# read the exit the pane-died hook wrote, and clean the worktree. They never touch the default socket.
pnpm vitest run --project executor-tmux

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

echo "smoke: agn run, status, stop and clean against the fake agent under tmux"
# A private tmux tmpdir keeps the smoke off the author's own `agn` socket, and it has to be short:
# a unix socket path is capped near 104 bytes.
TMUX_TMPDIR="$(mktemp -d /tmp/agn-smoke-XXXXXX)"
export TMUX_TMPDIR
# The last command in an EXIT trap decides the script's exit code, so the kill cannot be the last
# one: by then the executor has usually reaped the sessions and tmux answers "no server running".
trap 'PATH="$SMOKE_PATH" tmux -L agn kill-server 2> /dev/null || true; rm -rf "$AGNOSTIC_HOME" "$WORK" "$TMUX_TMPDIR"' EXIT

FAKEBIN="$WORK/fake-bin"
mkdir -p "$FAKEBIN"
# `claude` is the fake agent under another name; it answers --version itself so detection is quick.
{
  echo '#!/bin/sh'
  echo 'case "$1" in --version) echo 1.0.0; exit 0 ;; esac'
  echo "exec $PWD/tests/fixtures/fake-agent.sh --log $WORK/agent.log \"\$@\""
} > "$FAKEBIN/claude"
chmod +x "$FAKEBIN/claude"
# /usr/sbin is where macOS keeps lsof, which is how the executor reads a process's directory.
SMOKE_PATH="$FAKEBIN:$(dirname "$NODE"):$(dirname "$(command -v tmux)"):/usr/bin:/bin:/usr/sbin:/sbin"

agx() {
  PATH="$SMOKE_PATH" "$NODE" --import tsx --conditions development packages/cli/src/main.ts "$@"
}

mkdir -p "$WORK/runrepo" "$WORK/runfolder"
git -C "$WORK/runrepo" init -q
git -C "$WORK/runrepo" -c user.email=t@agn.test -c user.name=agn commit -q --allow-empty -m first
agx add "$WORK/runrepo" > /dev/null
agx add "$WORK/runfolder" > /dev/null

agx run "smoke task" --profile claude-code --repo "$WORK/runrepo" > "$WORK/run.txt"
grep -q "^started " "$WORK/run.txt"
TASK="$(awk 'NR == 1 { print $2 }' "$WORK/run.txt")"
agx status | grep -q "running"
agx status "$TASK" | grep -q "^tmux: *agn-$TASK"
agx stop "$TASK" | grep -q "^stopped $TASK"
agx status | grep -q "stopped"
# No session id was ever captured, so resume starts the agent again with the task context. --json
# keeps the terminal: without it, agn hands this shell to tmux and waits for a detach.
agx resume "$TASK" --json > "$WORK/resume.json"
grep -q '"via": "fresh"' "$WORK/resume.json"
agx status "$TASK" | grep -q "running"
agx stop "$TASK" | grep -q "^stopped $TASK"
agx clean | grep -q "^cleaned $TASK"

agx run "folder task" --profile claude-code --repo "$WORK/runfolder" > "$WORK/folder.txt"
grep -q "^in place: " "$WORK/folder.txt"
FOLDER_TASK="$(awk 'NR == 1 { print $2 }' "$WORK/folder.txt")"
! agx run "second folder task" --profile claude-code --repo "$WORK/runfolder" 2> "$WORK/folder-error.txt"
grep -q "folder workspaces run one task at a time" "$WORK/folder-error.txt"
agx stop "$FOLDER_TASK" | grep -q "^stopped"

echo "smoke: agn adopt of an agent started outside agn"
# ps reports the script's own name, so this copy of the fake agent has to be called `claude`; the
# wrapper on SMOKE_PATH cannot be, because detection runs it with --version.
ADOPT_BIN="$WORK/adopt-bin"
ADOPT_DIR="$WORK/runrepo/adopted"
mkdir -p "$ADOPT_BIN" "$ADOPT_DIR"
cp tests/fixtures/fake-agent.sh "$ADOPT_BIN/claude"
chmod +x "$ADOPT_BIN/claude"
PATH="$SMOKE_PATH" tmux -L agn new-session -d -s smoke-adopt -c "$ADOPT_DIR" "$ADOPT_BIN/claude"
# The process has to reach the process table before agn can see it.
for _ in 1 2 3 4 5; do
  if agx adopt "$ADOPT_DIR" > "$WORK/adopt.txt" 2> "$WORK/adopt-error.txt"; then
    break
  fi
  sleep 1
done
grep -q "^adopted " "$WORK/adopt.txt"
ADOPTED="$(awk 'NR == 1 { print $2 }' "$WORK/adopt.txt")"
agx status "$ADOPTED" | grep -q "^origin: *adopted"
agx status "$ADOPTED" | grep -q "^tmux: *smoke-adopt"
agx stop "$ADOPTED" | grep -q "^stopped $ADOPTED"

agx daemon stop | grep -q "^agnd stopped"
