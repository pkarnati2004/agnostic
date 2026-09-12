#!/bin/sh
# A harness stand-in for the executor and daemon tests: it starts, prints, reads stdin, and exits
# the way a real coding agent does, without a subscription. Copy it under another name (claude,
# codex-aarch64) to exercise process detection.
set -u

log_file=""
hook_command=""
exit_code=0
exit_after=""
ignore_term=0
prompt=""
self=$$
watchdog=""

while [ $# -gt 0 ]; do
  case "$1" in
    --log) log_file="$2"; shift 2 ;;
    --hook-command) hook_command="$2"; shift 2 ;;
    --exit-after) exit_after="$2"; shift 2 ;;
    --exit-code) exit_code="$2"; shift 2 ;;
    --ignore-term) ignore_term=1; shift ;;
    *) prompt="${prompt:+$prompt }$1"; shift ;;
  esac
done

# The hook chain under test: a Claude-shaped payload on stdin, and whatever command the harness's
# own hook config named. It runs in the background because a real harness does not wait for it.
send_hook() {
  [ -n "$hook_command" ] || return 0
  payload="{\"hook_event_name\":\"$1\",\"session_id\":\"fake-$self\",\"cwd\":\"$PWD\"$2}"
  (printf '%s' "$payload" | sh -c "$hook_command" > /dev/null 2>&1) &
}

log() {
  printf '%s\n' "$1"
  if [ -n "$log_file" ]; then
    printf '%s\n' "$1" >> "$log_file"
  fi
}

# The watchdog restarts on every line, so --exit-after measures idle time, not uptime.
start_watchdog() {
  [ -n "$exit_after" ] || return 0
  [ -z "$watchdog" ] || kill "$watchdog" 2>/dev/null
  ( sleep "$exit_after"; kill -USR1 "$self" 2>/dev/null ) &
  watchdog=$!
}

trap 'log "idle"; exit $exit_code' USR1
if [ "$ignore_term" -eq 1 ]; then
  trap '' TERM
else
  trap 'log term; exit 143' TERM
fi

# Ask for bracketed paste the way a real composer does, so a paste arrives framed.
printf '\033[?2004h'
printf 'fake-agent ready\n'
log "ready cwd=$PWD AGN_TEST=${AGN_TEST:-} AGN_TASK_ID=${AGN_TASK_ID:-}"
send_hook SessionStart ',"source":"startup"'
if [ -n "$prompt" ]; then
  log "prompt: $prompt"
fi

start_watchdog
while IFS= read -r line; do
  log "line: $line"
  case "$line" in
    exit) exit "$exit_code" ;;
    crash) exit 3 ;;
    spawn) sleep 30 & log "spawned $!" ;;
    work) send_hook UserPromptSubmit '' ;;
    ask) send_hook Stop '' ;;
    permission) send_hook PermissionRequest ',"tool_name":"Bash"' ;;
    approved) send_hook PostToolUse ',"tool_name":"Bash"' ;;
  esac
  start_watchdog
done
log "eof"
exit "$exit_code"
