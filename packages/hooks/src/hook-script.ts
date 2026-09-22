import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgnosticPaths, HarnessId } from "@agnostic/core";

/** The env var every child agn launches carries, so a hook can name its task without a lookup. */
export const AGN_TASK_ID = "AGN_TASK_ID";

const SCRIPT_MODE = 0o755;

export function hookScriptPath(paths: AgnosticPaths): string {
  return join(paths.hooks, "post.sh");
}

/**
 * What goes in a harness's hook config: one script and the harness it reports for. A harness whose
 * payload does not name its own event is installed with the event as a third argument instead.
 */
export function hookCommand(paths: AgnosticPaths, harness: HarnessId, event?: string): string {
  const command = `sh ${quoted(hookScriptPath(paths))} ${harness}`;
  // The event name is the harness's own string, so it is quoted like every other argument here.
  return event === undefined ? command : `${command} ${quoted(event)}`;
}

/** How an installer recognises its own entries in a config: the script path as the command spells it. */
export function hookScriptMarker(paths: AgnosticPaths): string {
  return quoted(hookScriptPath(paths));
}

/** Rewritten only when the text differs, so an unchanged install does not touch the file's mtime. */
export async function writeHookScript(paths: AgnosticPaths): Promise<void> {
  const file = hookScriptPath(paths);
  const text = scriptText(paths);
  if ((await readFile(file, "utf8").catch(() => null)) === text) {
    return;
  }
  await mkdir(paths.hooks, { recursive: true });
  await writeFile(file, text, "utf8");
  await chmod(file, SCRIPT_MODE);
}

/**
 * The one hook command on this machine. It reads the port and the token at run time, so a daemon
 * that restarts on another port needs no reinstall and no config file carries a token. Every path
 * out of it is exit 0: a hook that fails, or that waits, is a harness that stutters.
 */
function scriptText(paths: AgnosticPaths): string {
  return `#!/bin/sh
# Written by agn. Every edit here is replaced the next time agn installs hooks.
# Usage: post.sh <harness> [event], with the harness's hook payload on stdin.
set -u

# stdin is read first and always: a hook that exits without reading gives the harness EPIPE.
payload=$(cat)
harness="\${1:-}"
# Only the harnesses whose payload does not name its own event are installed with this argument.
event="\${2:-}"
[ -n "$payload" ] || exit 0
[ -n "$harness" ] || exit 0

daemon=${quoted(paths.daemon)}
token_file=${quoted(paths.authToken)}
[ -f "$daemon" ] && [ -f "$token_file" ] || exit 0
port=$(sed -n 's/.*"port"[[:space:]]*:[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p' "$daemon" | head -n 1)
token=$(cat "$token_file")
[ -n "$port" ] && [ -n "$token" ] || exit 0

# macOS always has curl here; a harness may run hooks with a PATH that has nothing else on it.
curl=/usr/bin/curl
[ -x "$curl" ] || curl=curl

printf '%s' "$payload" | "$curl" -s -o /dev/null --noproxy 127.0.0.1 \\
  --connect-timeout 1 --max-time 2 \\
  -X POST "http://127.0.0.1:$port/hooks/$harness" \\
  -H "Authorization: Bearer $token" \\
  -H "Content-Type: application/json" \\
  -H "X-Agn-Task-Id: \${${AGN_TASK_ID}:-}" \\
  -H "X-Agn-Hook-Event: $event" \\
  --data-binary @- 2> /dev/null
exit 0
`;
}

/** POSIX single quoting: the only byte that cannot appear inside is the quote itself. */
function quoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
