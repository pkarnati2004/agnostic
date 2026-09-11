import { ExecaError, execa, type Options, type ResultPromise } from "execa";
import { ProcessError } from "./error.js";

export type ProcessOptions = {
  cwd?: string;
  env?: Record<string, string>;
  inheritEnv?: boolean;
  timeoutMs?: number;
  input?: string;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

const STDERR_TAIL_LINES = 20;

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

function execaOptions(opts: ProcessOptions) {
  const inherited = scrubEnv(opts.inheritEnv === false ? {} : process.env);
  return {
    cwd: opts.cwd,
    env: { ...inherited, ...opts.env },
    extendEnv: false,
    timeout: opts.timeoutMs,
    input: opts.input,
    stripFinalNewline: true,
  } satisfies Options;
}

export async function run(
  command: string,
  args: string[] = [],
  opts: ProcessOptions = {},
): Promise<RunResult> {
  const startedAt = Date.now();
  try {
    const result = await execa(command, args, execaOptions(opts));
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
      durationMs: Date.now() - startedAt,
    };
  } catch (cause) {
    throw toProcessError(command, args, cause);
  }
}

/** For callers that need the live streams (tmux, `git worktree`); they own the failure handling. */
export function spawn(
  command: string,
  args: string[] = [],
  opts: ProcessOptions = {},
): ResultPromise {
  return execa(command, args, execaOptions(opts));
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
  const stderr = tail(typeof cause.stderr === "string" ? cause.stderr : "");
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

function tail(stderr: string): string {
  return stderr.split("\n").slice(-STDERR_TAIL_LINES).join("\n").trim();
}
