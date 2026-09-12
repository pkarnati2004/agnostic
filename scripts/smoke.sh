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

echo "smoke: catalog unit tests"
pnpm vitest run --project catalog

echo "smoke: usage unit tests"
pnpm vitest run --project usage

echo "smoke: registry unit tests"
pnpm vitest run --project registry

echo "smoke: recommender unit tests"
pnpm vitest run --project recommender

echo "smoke: daemon unit tests"
pnpm vitest run --project daemon

echo "smoke: sync unit tests"
pnpm vitest run --project sync

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

# The four tier-1 harnesses, none of them installed on this PATH, plus the gh row.
test "$(agn doctor | grep -c "not installed")" -eq 5
agn doctor | grep -q "^tools: gh"
test "$(agn profiles | wc -l)" -eq 2

# No harness is installed here, so there is no plan to know and nothing to ask about.
agn doctor | head -1 | grep -q "plan"
! agn doctor | grep -q "plan unknown for"
# The plan the user names is written to config.yaml, which keeps the port line it already had.
echo "port: 7439" > "$AGNOSTIC_HOME/config.yaml"
agn doctor --plan claude=max20 > /dev/null
grep -q "claude: max20" "$AGNOSTIC_HOME/config.yaml"
grep -q "port: 7439" "$AGNOSTIC_HOME/config.yaml"
agn doctor --json | "$NODE" -e "
const read = require('node:fs').readFileSync(0, 'utf8');
const { plans, planOptions } = JSON.parse(read);
if (plans.claude !== 'max20') { throw new Error('doctor did not report the plan it was given'); }
if (!planOptions.some((option) => option.vendor === 'claude')) {
  throw new Error('doctor offered no plans from the catalog');
}
"
# A plan agn does not bill for is a usage error; a plan the catalog does not know is recorded.
! agn doctor --plan nope=pro 2> "$WORK/plan-error.txt"
grep -q "claude, chatgpt" "$WORK/plan-error.txt"
agn doctor --plan chatgpt=go > /dev/null
grep -q "chatgpt: go" "$AGNOSTIC_HOME/config.yaml"
# The port line goes back: every daemon the rest of the smoke starts must stay off the real 7431,
# where the author's own daemon lives.
printf 'port: %s\n' "$FREE_PORT" > "$AGNOSTIC_HOME/config.yaml"

! agn add "$WORK/nope" 2> "$WORK/add-error.txt"
grep -q "does not exist" "$WORK/add-error.txt"
! agn add "$WORK/nope" --json 2> "$WORK/add-error.json"
grep -q '"code":"path-not-found"' "$WORK/add-error.json"

echo "smoke: agn init and agn sync on a repo that already has a CLAUDE.md"
printf '# gitrepo\n\nRun the tests before you finish.\n' > "$WORK/gitrepo/CLAUDE.md"
agn init --repo "$WORK/gitrepo" > "$WORK/init.txt"
grep -q "^created .ag/instructions.md (from CLAUDE.md)$" "$WORK/init.txt"
grep -q "^next: agn sync$" "$WORK/init.txt"
cmp "$WORK/gitrepo/CLAUDE.md" "$WORK/gitrepo/.ag/instructions.md"

agn sync --dry-run --repo "$WORK/gitrepo" > "$WORK/sync-dry.txt"
grep -q "generated by agn sync" "$WORK/sync-dry.txt"
# Nothing is written on a dry run: CLAUDE.md is still the file agn init read.
cmp "$WORK/gitrepo/CLAUDE.md" "$WORK/gitrepo/.ag/instructions.md"

test "$(agn sync --repo "$WORK/gitrepo" | grep -c "^wrote \|^updated ")" -eq 2
head -n 1 "$WORK/gitrepo/CLAUDE.md" | grep -q "generated by agn sync"
head -n 1 "$WORK/gitrepo/AGENTS.md" | grep -q "generated by agn sync"
test "$(agn sync --repo "$WORK/gitrepo" | grep -c "^unchanged ")" -eq 2
cp "$WORK/gitrepo/AGENTS.md" "$WORK/agents-after-second-sync.md"
agn sync --repo "$WORK/gitrepo" > /dev/null
cmp "$WORK/gitrepo/AGENTS.md" "$WORK/agents-after-second-sync.md"

agn daemon stop | grep -q "^agnd stopped"
! agn daemon status

echo "smoke: agn run, status, stop and clean against the fake agent under tmux"
# A private tmux tmpdir keeps the smoke off the author's own `agn` socket, and it has to be short:
# a unix socket path is capped near 104 bytes.
TMUX_TMPDIR="$(mktemp -d /tmp/agn-smoke-XXXXXX)"
export TMUX_TMPDIR
# The last command in an EXIT trap decides the script's exit code, so the kill cannot be the last
# one: by then the executor has usually reaped the sessions and tmux answers "no server running".
trap 'kill "${CATALOG_PID:-}" 2> /dev/null || true; PATH="$SMOKE_PATH" tmux -L agn kill-server 2> /dev/null || true; rm -rf "$AGNOSTIC_HOME" "$WORK" "$TMUX_TMPDIR" "${OPTOUT_HOME:-/nonexistent}"' EXIT

FAKEBIN="$WORK/fake-bin"
mkdir -p "$FAKEBIN"
# The fake agent fires its hooks through whatever command the installed config names, the way a
# real harness does, so the smoke exercises the install and not a command the smoke made up.
cat > "$WORK/hook-command.cjs" <<'EOF'
const { readFileSync } = require("node:fs");
try {
  const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const entries = Object.values(config.hooks ?? {}).flat().flatMap((group) => group.hooks ?? []);
  const found = entries.find((entry) => typeof entry.command === "string");
  if (found) {
    process.stdout.write(found.command);
  }
} catch {}
EOF
# `claude` is the fake agent under another name; it answers --version itself so detection is quick.
{
  echo '#!/bin/sh'
  echo 'case "$1" in --version) echo 1.0.0; exit 0 ;; esac'
  echo "hook=\"\$(node '$WORK/hook-command.cjs' \"\$PWD/.claude/settings.local.json\" 2> /dev/null)\""
  echo 'if [ -n "$hook" ]; then'
  echo "  exec $PWD/tests/fixtures/fake-agent.sh --log $WORK/agent.log --hook-command \"\$hook\" \"\$@\""
  echo 'fi'
  echo "exec $PWD/tests/fixtures/fake-agent.sh --log $WORK/agent.log \"\$@\""
} > "$FAKEBIN/claude"
chmod +x "$FAKEBIN/claude"
# The editor `agn open` detects: it records the directory it was asked to open and exits.
{
  echo '#!/bin/sh'
  echo "echo \"\$@\" >> $WORK/code.log"
} > "$FAKEBIN/code"
chmod +x "$FAKEBIN/code"
# /usr/sbin is where macOS keeps lsof, which is how the executor reads a process's directory.
SMOKE_PATH="$FAKEBIN:$(dirname "$NODE"):$(dirname "$(command -v tmux)"):/usr/bin:/bin:/usr/sbin:/sbin"

# A home of its own: the daemon reads transcript directories under HOME when a task closes and
# when usage is asked for, and a smoke run must never read the author's.
USAGE_HOME="$WORK/usage-home"
mkdir -p "$USAGE_HOME/.claude/projects/-work-usage"

agx() {
  HOME="$USAGE_HOME" PATH="$SMOKE_PATH" "$NODE" --import tsx --conditions development packages/cli/src/main.ts "$@"
}

mkdir -p "$WORK/runrepo" "$WORK/runfolder"
git -C "$WORK/runrepo" init -q
git -C "$WORK/runrepo" -c user.email=t@agn.test -c user.name=agn commit -q --allow-empty -m first
agx add "$WORK/runrepo" > /dev/null
agx add "$WORK/runfolder" > /dev/null

echo "smoke: agn recommend against the repo the fake agent runs in"
agx recommend "fix the flaky auth test" --repo "$WORK/runrepo" > "$WORK/recommend.txt"
grep -q "^Task: debug, small, risk: auth$" "$WORK/recommend.txt"
grep -q "^Recommended: claude-code:" "$WORK/recommend.txt"
grep -q "^Risk: touches auth" "$WORK/recommend.txt"
agx recommend "fix the flaky auth test" --repo "$WORK/runrepo" --json | grep -q '"taskClass"'

agx run "smoke task" --profile claude-code --repo "$WORK/runrepo" > "$WORK/run.txt"
grep -q "^started " "$WORK/run.txt"
TASK="$(awk 'NR == 1 { print $2 }' "$WORK/run.txt")"
agx status | grep -q "running"
agx status "$TASK" | grep -q "^tmux: *agn-$TASK"

echo "smoke: the hook chain, from the installed config to a waiting task"
agx doctor | grep -q "^tools: gh"
agx hooks install --repo "$WORK/runrepo" | grep -q "^installed claude-code hooks"
test -f "$WORK/runrepo/.claude/settings.local.json"
! grep -q "$(cat "$AGNOSTIC_HOME/auth-token")" "$WORK/runrepo/.claude/settings.local.json"
# `ask` is the fake agent's "my turn is over": it fires a Stop hook through the installed command.
PATH="$SMOKE_PATH" tmux -L agn send-keys -t "agn-$TASK" ask Enter
WAITED=0
while [ "$WAITED" -lt 40 ]; do
  agx status "$TASK" | grep -q "^status: *waiting" && break
  WAITED=$((WAITED + 1))
  sleep 0.25
done
agx status "$TASK" | grep -q "^status: *waiting"

echo "smoke: agn open against a stub editor on PATH"
WORKTREE="$(agx status "$TASK" | awk '$1 == "worktree:" { print $2 }')"
agx open "$TASK" --editor code | grep -q "^opened $WORKTREE in Visual Studio Code"
grep -qF "$WORKTREE" "$WORK/code.log"
agx open "$TASK" --json | grep -q '"argv"'

agx stop "$TASK" | grep -q "^stopped $TASK"
agx status | grep -q "stopped"
# The SessionStart hook above captured the harness's own session id, so resume hands it back
# instead of re-prompting. --json keeps the terminal: without it, agn hands this shell to tmux.
agx resume "$TASK" --json > "$WORK/resume.json"
grep -q '"via": "native"' "$WORK/resume.json"
agx status "$TASK" | grep -q "running"

echo "smoke: agn outcomes for a task whose branch was merged"
# What the agent would leave behind: a commit on the task's branch, made while it is still running.
WORKTREE="$(agx status "$TASK" | awk '$1 == "worktree:" { print $2 }')"
BRANCH="$(agx status "$TASK" | awk '$1 == "branch:" { print $2 }')"
printf 'one\ntwo\nthree\n' > "$WORKTREE/agent.txt"
git -C "$WORKTREE" add agent.txt
git -C "$WORKTREE" -c user.email=t@agn.test -c user.name=agn commit -q -m "the agent's work"
agx stop "$TASK" | grep -q "^stopped $TASK"

agx outcomes "$TASK" > "$WORK/outcomes.txt"
grep -q "^tests:" "$WORK/outcomes.txt"
grep -q "^agent lines: *3$" "$WORK/outcomes.txt"
grep -q "^verdict: *not merged$" "$WORK/outcomes.txt"
git -C "$WORK/runrepo" merge --no-ff -q -m "merge the task" "$BRANCH"
agx outcomes "$TASK" | grep -q "^verdict: *accepted"
agx outcomes "$TASK" --json | grep -q '"accepted": true'

echo "smoke: agn handoff to the next agent"
HANDOFF_NOTE="the parser is done, the printer is not"
agx handoff "$TASK" --to claude-code --note "$HANDOFF_NOTE" > "$WORK/handoff.txt"
grep -q "^handed off $TASK to " "$WORK/handoff.txt"
CHILD="$(awk 'NR == 1 { print $5 }' "$WORK/handoff.txt")"
grep -q "## Handoff to claude-code:default:native at " "$WORK/runrepo/.ag/tasks/$TASK.md"
# The child is launched with the section as part of its first prompt; the fake agent logs it.
for _ in 1 2 3 4 5; do
  grep -q "## Handoff from $TASK" "$WORK/agent.log" && break
  sleep 1
done
grep -q "## Handoff from $TASK" "$WORK/agent.log"
grep -q "$HANDOFF_NOTE" "$WORK/agent.log"
agx status "$CHILD" | grep -q "^parent: *$TASK"
agx stop "$CHILD" | grep -q "^stopped $CHILD"

agx clean | grep -q "^cleaned $TASK"

agx run "folder task" --profile claude-code --repo "$WORK/runfolder" > "$WORK/folder.txt"
grep -q "^in place: " "$WORK/folder.txt"
FOLDER_TASK="$(awk 'NR == 1 { print $2 }' "$WORK/folder.txt")"
! agx run "second folder task" --profile claude-code --repo "$WORK/runfolder" 2> "$WORK/folder-error.txt"
grep -q "folder workspaces run one task at a time" "$WORK/folder-error.txt"
agx stop "$FOLDER_TASK" | grep -q "^stopped"
# A folder task has no branch of agn's, so it has no lines and no verdict to report.
agx outcomes "$FOLDER_TASK" | grep -q "^agent lines: *-$"
agx outcomes "$FOLDER_TASK" | grep -q "^verdict: *-$"

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

echo "smoke: agn usage over a transcript the agent left behind"
# A session agn did not start, written where Claude Code writes: it counts against the plan and
# belongs to no task.
NOW="$("$NODE" -e "process.stdout.write(new Date().toISOString())")"
printf '{"type":"assistant","sessionId":"s-smoke","timestamp":"%s","cwd":"%s","requestId":"req_s","message":{"id":"msg_s","model":"claude-fable-5-1","usage":{"input_tokens":1000,"output_tokens":500,"cache_read_input_tokens":200,"cache_creation_input_tokens":0}}}\n' \
  "$NOW" "$WORK/runrepo" > "$USAGE_HOME/.claude/projects/-work-usage/s-smoke.jsonl"

agx usage > "$WORK/usage.txt"
grep -q "^today (" "$WORK/usage.txt"
grep -q "^this week (from " "$WORK/usage.txt"
grep -q "^unknown plan  claude-code " "$WORK/usage.txt"
grep -q "1,700" "$WORK/usage.txt"
agx usage --json > "$WORK/usage.json"
grep -q '"unattributedTokens": 1700' "$WORK/usage.json"
agx daemon stop | grep -q "^agnd stopped"
echo "smoke: agn catalog update against a loopback catalog server"
# The published catalog agn would fetch, served from this machine: the smoke never leaves it.
CATALOG_DIR="$WORK/catalog"
mkdir -p "$CATALOG_DIR"
cp tests/fixtures/catalog/remote/catalog.json "$CATALOG_DIR/catalog.json"
# The server binds an ephemeral loopback port and prints it, so the smoke claims no fixed port.
"$NODE" tests/fixtures/bin/catalog-server.mjs "$CATALOG_DIR" > "$WORK/catalog-server.log" &
CATALOG_PID=$!
CATALOG_PORT=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  CATALOG_PORT="$(awk '{ print $NF }' "$WORK/catalog-server.log")"
  [ -n "$CATALOG_PORT" ] && break
  sleep 0.25
done
test -n "$CATALOG_PORT"
curl -fsS "http://127.0.0.1:$CATALOG_PORT/manifest.json" > /dev/null
export AGNOSTIC_CATALOG_URL="http://127.0.0.1:$CATALOG_PORT"

agx catalog update | grep -q "^catalog updated 1 → 2 (generated 2026-09-08, 4 benchmark rows)$"
test -f "$AGNOSTIC_HOME/catalog.json"
agx catalog update | grep -q "^catalog 2 is current (generated 2026-09-08)$"
grep -q '"outcome": "current"' "$AGNOSTIC_HOME/catalog-check.json"
agx catalog show claude-code:opus:native | head -1 | grep -q "^catalog 2 (downloaded, generated 2026-09-08; checked "
agx catalog show claude-code:opus:native | grep -q "terminal-bench"
agx catalog show claude-code:default:native | grep -q "^no rows for claude-code:default:native$"
agx daemon stop | grep -q "^agnd stopped"

echo "smoke: catalog_check: false keeps the daemon from reaching out at all"
OPTOUT_HOME="$(mktemp -d)"
OPTOUT_PORT="$("$NODE" -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>process.stdout.write(String(p)))})")"
printf 'port: %s\ncatalog_check: false\n' "$OPTOUT_PORT" > "$OPTOUT_HOME/config.yaml"
AGNOSTIC_HOME="$OPTOUT_HOME" agx daemon start > /dev/null
# The start check would have run five seconds in; nothing may be recorded, now or later.
sleep 7
test ! -f "$OPTOUT_HOME/catalog-check.json"
AGNOSTIC_HOME="$OPTOUT_HOME" agx catalog show claude-code:opus:native | head -1 | grep -q "daily check off)$"
# Opting out of the daily check does not take the command away.
AGNOSTIC_HOME="$OPTOUT_HOME" agx catalog update | grep -q "^catalog updated 1 → 2 "
AGNOSTIC_HOME="$OPTOUT_HOME" agx daemon stop | grep -q "^agnd stopped"
unset AGNOSTIC_CATALOG_URL
kill "$CATALOG_PID" 2> /dev/null || true
# Reaped here so the shell does not announce the kill in the middle of the smoke's output.
wait "$CATALOG_PID" 2> /dev/null || true

echo "smoke: nothing in agn calls out except the catalog check"
# This grep catches a new naked fetch call: the two files it finds both talk to loopback (ADR 002).
# The catalog's own call is made through an injected fetch, so the host grep below is what covers
# it - one file names a host that is not this machine, and that file is the catalog's source list.
FETCHERS="$(grep -rlE "(^|[^A-Za-z.])fetch\(" packages/*/src --include='*.ts' | grep -v '\.test\.ts$' | sort | tr '\n' ' ')"
test "$FETCHERS" = "packages/core/src/daemon-probe.ts packages/registry/src/detect-local-servers.ts "
test "$(grep -rl "raw.githubusercontent.com" packages/*/src --include='*.ts' | wc -l | tr -d ' ')" -eq 1
grep -q "raw.githubusercontent.com" packages/catalog/src/catalog-source.ts
