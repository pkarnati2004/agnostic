// Adapted from stablyai/orca (MIT © Lovecast Inc.).
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgnosticPaths } from "@agnostic/core";
import { quoted, rateLimitsFile, statusLineScriptPath } from "../hook-script.js";

const SCRIPT_MODE = 0o755;

/** Claude Code runs the status line about three times a second while it streams. */
const MIN_SECONDS_BETWEEN_WRITES = 15;

/** Rewritten only when the text differs, so an unchanged install does not touch the file's mtime. */
export async function writeStatusLineScript(paths: AgnosticPaths): Promise<void> {
  const file = statusLineScriptPath(paths);
  const text = scriptText(paths);
  if ((await readFile(file, "utf8").catch(() => null)) === text) {
    return;
  }
  await mkdir(paths.hooks, { recursive: true });
  await writeFile(file, text, "utf8");
  await chmod(file, SCRIPT_MODE);
}

/**
 * Claude Code pipes its status-line payload to this on every turn, and the plan's rate limits ride
 * on it. The script writes the bytes it was given and parses nothing. Every path out of the
 * capture is a success: a status line that fails, or that waits, is a harness the user watches
 * stutter. The one status this script does not own is the user's own command, which it chains.
 */
function scriptText(paths: AgnosticPaths): string {
  const file = rateLimitsFile(paths, "claude-code");
  return `#!/bin/sh
# Written by agn. Every edit here is replaced the next time agn installs hooks.
# Usage: statusline.sh [your own statusLine command], with Claude Code's payload on stdin.
set -u

# stdin is read first and always: exiting without reading gives Claude Code EPIPE. The shell's own
# reader, not cat, because this runs about three times a second while the agent streams.
payload=
line=
while IFS= read -r line || [ -n "$line" ]; do
  payload="\${payload}\${line}
"
  line=
done
payload=\${payload%?}
[ -n "$payload" ] || exit 0

capture() {
  # rate_limits is there only for claude.ai-subscriber sessions, after the first response.
  case "$payload" in
    *'"rate_limits"'*) ;;
    *) return 0 ;;
  esac
  now=$(date +%s 2>/dev/null) || now=
  # A leading zero reads as octal inside $(( )), and a bad constant is fatal in dash.
  case "$now" in 0|[1-9]|[1-9][0-9]*) ;; *) now= ;; esac
  if [ -n "$now" ] && [ -f "$stamp" ]; then
    last=
    IFS= read -r last < "$stamp" 2>/dev/null || :
    case "$last" in 0|[1-9]|[1-9][0-9]*) ;; *) last= ;; esac
    if [ -n "$last" ] && [ $((now - last)) -ge 0 ] && [ $((now - last)) -lt ${MIN_SECONDS_BETWEEN_WRITES} ]; then
      return 0
    fi
  fi
  mkdir -p ${quoted(dirname(file))} 2>/dev/null || return 0
  temp="$file.$$.tmp"
  # A reader stats this file for its age, so it is renamed into place, never written in place.
  if printf '%s' "$payload" > "$temp" 2>/dev/null && mv -f "$temp" "$file" 2>/dev/null; then
    [ -n "$now" ] && printf '%s\\n' "$now" > "$stamp" 2>/dev/null
  else
    rm -f "$temp" 2>/dev/null
  fi
  return 0
}

file=${quoted(file)}
stamp=${quoted(file.replace(/\.json$/, ".stamp"))}
capture

# The user's own statusLine command, if they had one: it reads the same payload and prints the
# status line they set up, so agn's capture costs them nothing on screen.
command=\${1:-}
[ -n "$command" ] || exit 0
printf '%s' "$payload" | sh -c "$command"
exit $?
`;
}
