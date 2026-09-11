import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchRequest, SessionHandle } from "@agnostic/core";
import { ExecutorError } from "./error.js";
import {
  assertUsableVersion,
  hasSession,
  killSession,
  paneDead,
  pasteText,
  runMutation,
  sessionName,
  type TmuxClient,
} from "./tmux-client.js";

// A detached session has no client to size it, and a TUI that fixes its layout on the first paint
// keeps drawing 80 columns into a wider pane forever.
const WINDOW_COLS = 200;
const WINDOW_ROWS = 50;
// Long enough for a harness to draw its composer before the prompt is pasted into it.
const PROMPT_DELAY_MS = 1_000;

export async function launchSession(
  client: TmuxClient,
  sessionsDir: string,
  req: LaunchRequest,
): Promise<SessionHandle> {
  const name = sessionName(req.taskId);
  await assertDirectory(req.cwd);
  await assertUsableVersion(client);
  await clearDeadSession(client, name);
  await runMutation(client, newSessionArgs(name, req));
  // The pane must survive its process so the hook can read the exit status off it.
  await runMutation(client, ["set-option", "-w", "-t", name, "remain-on-exit", "on"]);
  const exitFile = join(sessionsDir, `${name}.exit`);
  await runMutation(client, ["set-hook", "-t", name, "pane-died", paneDiedHook(exitFile)]);
  const prompt = req.command.promptAfterStart;
  if (prompt !== null) {
    await new Promise((resolve) => setTimeout(resolve, PROMPT_DELAY_MS));
    await pasteText(client, name, prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  }
  return { taskId: req.taskId, tmuxSession: name, tmuxSocket: client.socket, cwd: req.cwd };
}

/** The command is separate argv tokens: a single string would be wrapped in `$SHELL -c`, and a
 * harness that is not the pane leader loses the controlling terminal it just asked for. */
export function newSessionArgs(name: string, req: LaunchRequest): string[] {
  const env = Object.entries(req.command.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  return [
    "new-session",
    "-d",
    "-s",
    name,
    "-c",
    req.cwd,
    "-x",
    String(WINDOW_COLS),
    "-y",
    String(WINDOW_ROWS),
    ...env,
    "--",
    req.command.command,
    ...req.command.args,
  ];
}

/** tmux expands the two format fields and hands the rest to `sh`, so the path is quoted for both. */
export function paneDiedHook(exitFile: string): string {
  const target = tmuxEscape(shellQuote(exitFile));
  return `run-shell "echo '#{pane_dead_status} #{pane_dead_signal}' > ${target}"`;
}

function shellQuote(value: string): string {
  return `'${value.split("'").join(`'"'"'`)}'`;
}

function tmuxEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#");
}

async function clearDeadSession(client: TmuxClient, name: string): Promise<void> {
  if (!(await hasSession(client, name))) {
    return;
  }
  if ((await paneDead(client, name)) === true) {
    // The harness exited and the watcher has not reaped the session yet; the task may start again.
    await killSession(client, name);
    return;
  }
  throw new ExecutorError(`tmux session ${name} is already running`, {
    code: "session-exists",
    hint: `Attach to it with \`tmux -L agn attach -t ${name}\`, or stop the task first.`,
  });
}

async function assertDirectory(cwd: string): Promise<void> {
  const missing = new ExecutorError(`${cwd} is not a directory the harness can start in`, {
    code: "cwd-missing",
    hint: "Prepare the task's worktree again, or check that the repo is still where it was.",
  });
  try {
    if (!(await stat(cwd)).isDirectory()) {
      throw missing;
    }
  } catch {
    throw missing;
  }
}
