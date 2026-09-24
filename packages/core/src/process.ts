import { closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import {
  ExecaError,
  execa,
  type Options,
  type ResultPromise,
  type StdoutStderrOption,
} from "execa";
import { ProcessError } from "./error.js";

export type ProcessOptions = {
  cwd?: string;
  env?: Record<string, string>;
  inheritEnv?: boolean;
  timeoutMs?: number;
  input?: string;
  /** Survive the parent exiting; the caller still has to `unref()` the returned subprocess. */
  detached?: boolean;
  /** Ignore stdin and append both output streams to this file, for a process nobody is watching. */
  logFile?: string;
  /** Hand the terminal over: the child reads the user's keyboard and draws on their screen. */
  stdio?: "inherit";
};

/** What the process log records: never the environment, never a byte of output. */
export type ProcessLogEntry = {
  command: string;
  args: string[];
  cwd?: string;
  exitCode: number | null;
  durationMs: number;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

const OUTPUT_TAIL_LINES = 20;

let processLog: ((entry: ProcessLogEntry) => void) | null = null;

/** The daemon installs its logger here at start; nothing else in agnostic writes process lines. */
export function setProcessLog(sink: ((entry: ProcessLogEntry) => void) | null): void {
  processLog = sink;
}

function report(
  command: string,
  args: string[],
  opts: ProcessOptions,
  started: number,
  exitCode: number | null,
): void {
  processLog?.({
    command,
    args,
    ...(opts.cwd === undefined ? {} : { cwd: opts.cwd }),
    exitCode,
    durationMs: Date.now() - started,
  });
}

/** Signal 0 checks for a process without touching it; EPERM still means something is there. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return cause instanceof Error && "code" in cause && cause.code === "EPERM";
  }
}

/** pnpm exports dozens of `npm_*` variables; they confuse harnesses that read them as their own. */
export function scrubEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const scrubbed: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || key.startsWith("npm_")) {
      continue;
    }
    scrubbed[key] = value;
  }
  return scrubbed;
}

/** `execa` spawns before it returns, so by then the child holds the log's descriptor and we can't. */
function start(command: string, args: string[], opts: ProcessOptions): ResultPromise {
  let prepared: { options: Options; closeLog: () => void };
  try {
    prepared = execaOptions(opts);
  } catch (cause) {
    throw logFileError(command, args, opts.logFile ?? "", cause);
  }
  try {
    return execa(command, args, prepared.options);
  } finally {
    prepared.closeLog();
  }
}

/** Opening the log happens before the spawn, so its failure is still "the command did not start". */
function logFileError(command: string, args: string[], file: string, cause: unknown): ProcessError {
  return new ProcessError(
    `${describe(command, args)} was not started: its log file ${file} could not be opened`,
    {
      code: "process-log-file",
      hint: `Check that ${dirname(file)} is a directory you can write to.`,
      command,
      args,
      exitCode: null,
      stderr: "",
      cause,
    },
  );
}

function execaOptions(opts: ProcessOptions): { options: Options; closeLog: () => void } {
  const inherited = scrubEnv(opts.inheritEnv === false ? {} : process.env);
  const { streams, closeLog } = outputOptions(opts);
  return {
    options: {
      cwd: opts.cwd,
      env: { ...inherited, ...opts.env },
      extendEnv: false,
      timeout: opts.timeoutMs,
      input: opts.input,
      detached: opts.detached,
      stripFinalNewline: true,
      ...streams,
    },
    closeLog,
  };
}

/** A log file and an inherited terminal are two answers to the same question; the file wins. */
function outputOptions(opts: ProcessOptions): { streams: Options; closeLog: () => void } {
  if (opts.logFile !== undefined) {
    return redirect(opts.logFile);
  }
  const streams = opts.stdio === "inherit" ? ({ stdio: "inherit" } as const) : {};
  return { streams, closeLog: () => undefined };
}

/**
 * The file as the child's own fd 1 and 2. execa's `{file}` target is a stream in *this* process at
 * the end of a pipe, so a detached child - agnd - loses everything it writes once the process that
 * launched it exits: console lines, a stack trace, the reason it died. O_APPEND because the daemon
 * keeps its own handle on the same file for the structured log.
 */
function redirect(file: string): { streams: Options; closeLog: () => void } {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "a");
  // execa's types name only fd 1 and 2, its own streams; node gives the child any open descriptor.
  const target = fd as StdoutStderrOption;
  return {
    streams: { stdin: "ignore", stdout: target, stderr: target },
    closeLog: () => closeSync(fd),
  };
}

export async function run(
  command: string,
  args: string[] = [],
  opts: ProcessOptions = {},
): Promise<RunResult> {
  const startedAt = Date.now();
  try {
    const result = await start(command, args, opts);
    report(command, args, opts, startedAt, result.exitCode ?? 0);
    return {
      stdout: text(result.stdout),
      stderr: text(result.stderr),
      exitCode: result.exitCode ?? 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (cause) {
    // `start` already says what it means when the log file is the thing that failed.
    const error = cause instanceof ProcessError ? cause : toProcessError(command, args, cause);
    report(command, args, opts, startedAt, error.exitCode);
    throw error;
  }
}

/** For callers that need the live streams (tmux, `git worktree`); they own the failure handling. */
export function spawn(
  command: string,
  args: string[] = [],
  opts: ProcessOptions = {},
): ResultPromise {
  const startedAt = Date.now();
  const subprocess = start(command, args, opts);
  subprocess.then(
    (result) => report(command, args, opts, startedAt, result.exitCode ?? 0),
    (cause: unknown) => report(command, args, opts, startedAt, exitCodeOf(cause)),
  );
  return subprocess;
}

/** Nothing here asks execa for lines or buffers, so both streams come back as text or not at all. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function exitCodeOf(cause: unknown): number | null {
  return cause instanceof ExecaError ? (cause.exitCode ?? null) : null;
}

function toProcessError(command: string, args: string[], cause: unknown): ProcessError {
  if (!(cause instanceof ExecaError)) {
    return new ProcessError(`${describe(command, args)} could not be run`, {
      code: "process-failed",
      command,
      args,
      exitCode: null,
      stderr: "",
      cause,
    });
  }
  const stderr = tail(text(cause.stderr));
  const exitCode = cause.exitCode ?? null;
  const { code, summary, hint } = classify(command, cause, exitCode);
  const detail = stderr ? `\n${stderr}` : "";
  return new ProcessError(`${describe(command, args)} ${summary}${detail}`, {
    code,
    hint,
    command,
    args,
    exitCode,
    stderr,
    // Whole, not tailed: stdout never enters the message, and `git diff --no-index` answers a
    // patch of any length here with exit 1.
    stdout: text(cause.stdout),
    cause,
  });
}

function classify(
  command: string,
  error: ExecaError,
  exitCode: number | null,
): { code: string; summary: string; hint?: string } {
  if (error.code === "ENOENT") {
    return {
      code: "process-not-found",
      summary: "was not found",
      hint: `Install ${command} or pass its full path.`,
    };
  }
  if (error.timedOut) {
    return {
      code: "process-timeout",
      summary: "timed out",
      hint: "Raise timeoutMs or run the command by hand to see where it hangs.",
    };
  }
  if (error.signal) {
    return { code: "process-signal", summary: `was killed by ${error.signal}` };
  }
  return { code: "process-failed", summary: `exited with code ${exitCode ?? "unknown"}` };
}

function describe(command: string, args: string[]): string {
  return args.length > 0 ? `${command} ${args.join(" ")}` : command;
}

function tail(output: string): string {
  return output.split("\n").slice(-OUTPUT_TAIL_LINES).join("\n").trim();
}
