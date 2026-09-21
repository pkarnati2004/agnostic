#!/bin/sh
# A stand-in for Grok and Copilot reading their own hooks directory: each merges every JSON file
# under it and runs the command an event's entry names. agn owns one file there (agn.json); this
# script reads that file the way either CLI would and runs the command it finds for one event, with
# the event's payload on stdin - so the whole chain (install, agn.json, the hook script, curl, the
# daemon) is exercised without a subscription to either CLI.
#
# Usage: hooks-dir-agent.sh <home> <harness> <event>, with the payload on stdin.
set -eu

home="$1"
harness="$2"
event="$3"
config="$home/.$harness/hooks/agn.json"

[ -f "$config" ] || { echo "no $config: hooks-dir install did not run" >&2; exit 1; }

# The file is agn's own pretty-printed JSON (two-space indent), so the event's key sits on its own
# line four spaces in, and the first "command" (grok's layout) or "bash" (copilot's) line after it
# is the one entry agn installed. \\ in the JSON source is a single backslash once read as JSON.
command=$(awk -v key="\"$event\":" '
  $0 ~ ("^    " key) { found = 1 }
  found && /^ *"(command|bash)": "/ {
    sub(/^ *"(command|bash)": "/, "")
    sub(/",?$/, "")
    gsub(/\\\\/, "\\")
    print
    exit
  }
' "$config")

[ -n "$command" ] || { echo "no hook installed for $event in $config" >&2; exit 1; }

sh -c "$command"
