import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type LaunchRequest, newId, type SessionHandle } from "@agnostic/core";
import { waitForComposer } from "./composer-wait.js";
import { ExecutorError } from "./error.js";
import { exitFileName, isExitFileFor } from "./exit-file.js";
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

/** Where the launch reports what it noticed; the daemon passes its log's debug line. */
export type LaunchDebug = (msg: string, fields?: Record<string, string | number>) => void;

export async function launchSession(
  client: TmuxClient,
  sessionsDir: string,
  req: LaunchRequest,
  debug: LaunchDebug = () => {},
): Promise<SessionHandle> {
  const name = sessionName(req.taskId);
  await assertDirectory(req.cwd);
  await assertUsableVersion(client);
  await clearDeadSession(client, name);
  // A resume reuses the session name, so the previous run's exit file goes before this one starts.
  await clearExitFiles(sessionsDir, name);
  const launchId = newId();
  const exitFile = join(sessionsDir, exitFileName(name, launchId));
  await runMutation(client, newSessionArgs(name, req));
  // The pane must survive its process so the hook can read the exit status off it.
  await runMutation(client, ["set-option", "-w", "-t", name, "remain-on-exit", "on"]);
  await runMutation(client, ["set-hook", "-t", name, "pane-died", paneDiedHook(exitFile)]);
  const prompt = req.command.promptAfterStart;
  if (prompt !== null) {
    // A launch must not hang: a pane that never settles, or that is waiting on a screen only the
    // user can answer, is pasted into anyway and the reason goes in the log.
    const wait = await waitForComposer(client, name);
    // The harness can exit while the wait is polling - a bad flag, a missing credential. Null is no
    // such session and true is a pane whose process has exited: neither can be pasted into.
    if ((await paneDead(client, name)) !== false) {
      throw new ExecutorError(`task ${req.taskId} has no running session to type into`, {
        code: "session-not-running",
        hint: "The harness exited as it started; run `agn logs` or attach to the task to see why.",
      });
    }
    if (!wait.ready) {
      debug("pasting the first prompt into a pane that is not ready", {
        session: name,
        gate: wait.gate ?? "none",
      });
    }
    await pasteText(client, name, prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  }
  return {
    taskId: req.taskId,
    tmuxSession: name,
    tmuxSocket: client.socket,
    launchId,
    cwd: req.cwd,
  };
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

async function clearExitFiles(sessionsDir: string, session: string): Promise<void> {
  for (const name of await readdir(sessionsDir).catch(() => [] as string[])) {
    if (isExitFileFor(name, session)) {
      await rm(join(sessionsDir, name), { force: true });
    }
  }
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
