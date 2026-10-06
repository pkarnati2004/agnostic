// Adapted from asheshgoplani/agent-deck (MIT © Ashesh Goplani).
import { errorMessage, ProcessError, type RunResult, run, scrubEnv } from "@agnostic/core";
import { ExecutorError } from "./error.js";

/** agn's own socket, so `tmux kill-server` on the user's default server never ends a task. */
export const AGN_SOCKET = "agn";

const READ_TIMEOUT_MS = 3_000;
const MUTATION_TIMEOUT_MS = 5_000;
// -e on new-session and #{pane_dead_signal} both landed in 3.2.
const MINIMUM_VERSION = { major: 3, minor: 2 };
// Ink and other async composers read the paste-end marker and the Enter in one go without this.
const PASTE_SETTLE_MS = 100;

export type TmuxRunOptions = {
  timeoutMs?: number;
  input?: string;
  /** Return a non-zero exit instead of throwing; a timeout still throws, it is never "gone". */
  allowFailure?: boolean;
};

export type TmuxClient = {
  /** Null is the user's default server, where an adopted session may live. */
  socket: string | null;
  run(args: string[], opts?: TmuxRunOptions): Promise<RunResult>;
};

/** TMUX and TMUX_PANE would point a client at the server agn itself was started from. */
export function tmuxClientEnv(): Record<string, string> {
  const { TMUX: _tmux, TMUX_PANE: _pane, ...rest } = scrubEnv(process.env);
  return rest;
}

export function createTmuxClient(opts: {
  socketName: string | null;
  env: Record<string, string>;
  /** agn's own config, on every argv for agn's socket; null only for the user's default server. */
  configFile: string | null;
}): TmuxClient {
  const socket = opts.socketName === null ? null : checkedSocketName(opts.socketName);
  // tmux runs from "/" so the server never inherits a directory that is later deleted.
  const base = { cwd: "/", env: opts.env, inheritEnv: false } as const;
  return {
    socket,
    async run(args, runOpts = {}) {
      const argv = clientArgv(socket, opts.configFile, args);
      try {
        return await run("tmux", argv, {
          ...base,
          timeoutMs: runOpts.timeoutMs ?? READ_TIMEOUT_MS,
          ...(runOpts.input === undefined ? {} : { input: runOpts.input }),
        });
      } catch (cause) {
        if (runOpts.allowFailure && isExitFailure(cause)) {
          // core drops a failed command's stdout; no caller of allowFailure reads it.
          return { stdout: "", stderr: cause.stderr, exitCode: cause.exitCode, durationMs: 0 };
        }
        throw toExecutorError(argv, cause);
      }
    },
  };
}

/**
 * tmux reads `-f` only when it starts a server, and the server on agn's socket is started by one
 * of these commands, so the flag goes on all of them. The user's default server is theirs: agn
 * never starts it, and an adopted session there keeps the config it was started with.
 */
function clientArgv(socket: string | null, configFile: string | null, args: string[]): string[] {
  if (socket === null) {
    return ["-u", ...args];
  }
  if (configFile === null) {
    throw new ExecutorError("a tmux client on agn's socket was built without a config file", {
      code: "tmux-failed",
      hint: "This is a bug in agn: the executor writes ~/.agnostic/tmux.conf before it builds a client.",
    });
  }
  return ["-u", "-f", configFile, "-L", socket, ...args];
}

function checkedSocketName(name: string): string {
  if (name === "default") {
    throw new ExecutorError("the tmux socket name `default` is the user's own server", {
      code: "socket-name-invalid",
      hint: "Pick another socket name; agn's sessions must not share the default server.",
    });
  }
  if (name.length === 0 || name.includes("/")) {
    throw new ExecutorError(`\`${name}\` is not a usable tmux socket name`, {
      code: "socket-name-invalid",
      hint: "Use a plain name such as `agn`: it becomes a file under $TMUX_TMPDIR.",
    });
  }
  return name;
}

type ExitFailure = ProcessError & { exitCode: number };

function isExitFailure(cause: unknown): cause is ExitFailure {
  return (
    cause instanceof ProcessError && cause.code === "process-failed" && cause.exitCode !== null
  );
}

function toExecutorError(argv: string[], cause: unknown): ExecutorError {
  if (cause instanceof ProcessError && cause.code === "process-not-found") {
    return new ExecutorError("tmux is not installed", {
      code: "tmux-not-found",
      hint: "Install it with `brew install tmux` (macOS) or `apt install tmux` (Linux).",
      cause,
    });
  }
  const detail = errorMessage(cause);
  return new ExecutorError(`tmux ${argv.join(" ")} failed: ${detail}`, {
    code: "tmux-failed",
    hint: "Run the command by hand to see what the tmux server says.",
    cause,
  });
}

/** Task ids carry no `.` or `:`, so the id is always a legal tmux session name. */
export function sessionName(taskId: string): string {
  return `agn-${taskId}`;
}

export function taskIdFromSession(session: string): string | null {
  return session.startsWith("agn-") ? session.slice("agn-".length) : null;
}

export async function tmuxVersion(client: TmuxClient): Promise<string> {
  const result = await client.run(["-V"]);
  const match = /^tmux\s+(\S+)/.exec(result.stdout.trim());
  if (match?.[1] === undefined) {
    throw new ExecutorError(`could not read a version from \`tmux -V\` (${result.stdout.trim()})`, {
      code: "tmux-failed",
      hint: "Check that `tmux` on PATH is really tmux.",
    });
  }
  return match[1];
}

/** Throws unless the installed tmux is 3.2 or newer; `next` and `master` are builds ahead of it. */
export async function assertUsableVersion(client: TmuxClient): Promise<string> {
  const version = await tmuxVersion(client);
  if (version === "next" || version === "master") {
    return version;
  }
  const parts = /^(\d+)\.(\d+)/.exec(version);
  const major = Number(parts?.[1]);
  const minor = Number(parts?.[2]);
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    throw new ExecutorError(`could not read a version number from \`tmux -V\` (${version})`, {
      code: "tmux-failed",
      hint: "Check that `tmux` on PATH is really tmux.",
    });
  }
  if (
    major < MINIMUM_VERSION.major ||
    (major === MINIMUM_VERSION.major && minor < MINIMUM_VERSION.minor)
  ) {
    throw new ExecutorError(`tmux ${version} is too old for agn`, {
      code: "tmux-too-old",
      hint: "agn needs tmux 3.2 or newer; upgrade with `brew install tmux`.",
    });
  }
  return version;
}

export async function hasSession(client: TmuxClient, name: string): Promise<boolean> {
  const result = await client.run(["has-session", "-t", name], { allowFailure: true });
  return result.exitCode === 0;
}

/** Null when there is no such session; true when the pane process exited under remain-on-exit. */
export async function paneDead(client: TmuxClient, name: string): Promise<boolean | null> {
  const result = await client.run(
    ["list-panes", "-s", "-t", name, "-F", "#{session_name}|#{pane_dead}"],
    { allowFailure: true },
  );
  if (result.exitCode !== 0) {
    return null;
  }
  return parsePaneValue(result.stdout) === "1";
}

/** What the pane is showing now: visible lines only, no history and no escape sequences. */
export async function capturePane(client: TmuxClient, name: string): Promise<string> {
  const result = await client.run(["capture-pane", "-p", "-t", name], { allowFailure: true });
  return result.exitCode === 0 ? result.stdout : "";
}

export async function panePid(client: TmuxClient, name: string): Promise<number | null> {
  const result = await client.run(
    ["list-panes", "-s", "-t", name, "-F", "#{session_name}|#{pane_pid}"],
    { allowFailure: true },
  );
  if (result.exitCode !== 0) {
    return null;
  }
  const pid = Number(parsePaneValue(result.stdout));
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** Fields are joined with `|`: without a tty tmux rewrites a TAB, and every other control byte, to `_`. */
export function parsePaneValue(stdout: string): string | null {
  const line = stdout.split("\n")[0]?.trim();
  if (line === undefined || line === "") {
    return null;
  }
  return line.split("|").at(-1) ?? null;
}

export async function listSessions(client: TmuxClient): Promise<string[]> {
  const result = await client.run(["list-sessions", "-F", "#{session_name}"], {
    allowFailure: true,
  });
  if (result.exitCode !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** A session that is already gone is success: tmux exits non-zero for an unknown target. */
export async function killSession(client: TmuxClient, name: string): Promise<void> {
  await client.run(["kill-session", "-t", name], {
    timeoutMs: MUTATION_TIMEOUT_MS,
    allowFailure: true,
  });
}

export function runMutation(
  client: TmuxClient,
  args: string[],
  opts: TmuxRunOptions = {},
): Promise<RunResult> {
  return client.run(args, { timeoutMs: MUTATION_TIMEOUT_MS, ...opts });
}

let pasteSequence = 0;

/**
 * Delivers text the way a paste arrives: `-r` keeps embedded LFs (tmux would otherwise rewrite
 * them to CR, which submits), `-p` frames the body so a composer inserts the newlines as text.
 */
export async function pasteText(client: TmuxClient, name: string, text: string): Promise<void> {
  pasteSequence += 1;
  const buffer = `agn-${name}-${pasteSequence}`;
  try {
    await runMutation(client, ["load-buffer", "-b", buffer, "-"], { input: text });
  } catch (cause) {
    // The payload only ever reached a server-side buffer, so drop it rather than leave it staged.
    await client.run(["delete-buffer", "-b", buffer], { allowFailure: true });
    throw cause;
  }
  await runMutation(client, ["paste-buffer", "-p", "-r", "-d", "-b", buffer, "-t", name]);
  await new Promise((resolve) => setTimeout(resolve, PASTE_SETTLE_MS));
  await runMutation(client, ["send-keys", "-t", name, "Enter"]);
}
