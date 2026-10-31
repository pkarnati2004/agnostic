import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CoreError, spawn } from "@agnostic/core";

/** The argv that runs the daemon package's bin: this node, its loader flags, then the entry file. */
export type DaemonEntry = { argv: string[] };

export type DaemonRun = { exitCode: number; stdout: string; stderr: string };

/**
 * Resolving rather than importing keeps hono, better-sqlite3 and the registry out of the CLI
 * process. The parent's execArgv comes along so a CLI running from source under tsx starts a
 * daemon from source too. The published bundle ships `agnd.js` beside `main.js`, so that comes
 * first; `from` is this file's URL, a parameter so the sibling case can be tested.
 */
export function resolveDaemonEntry(from: string = import.meta.url): DaemonEntry {
  const beside = fileURLToPath(new URL("./agnd.js", from));
  if (existsSync(beside)) {
    return { argv: [process.execPath, ...process.execArgv, beside] };
  }
  let main: string;
  try {
    main = fileURLToPath(import.meta.resolve("@agnostic/daemon/main"));
  } catch (cause) {
    throw new CoreError("the agn daemon is not installed next to this CLI", {
      code: "daemon-entry-missing",
      hint: "Reinstall agnostic-dev.",
      cause,
    });
  }
  return { argv: [process.execPath, ...process.execArgv, main] };
}

/** What the daemon bin left behind: execa reports the same fields whether it exited 0 or not. */
type ChildOutcome = { exitCode?: number | null; stdout?: unknown; stderr?: unknown };

/**
 * Output is captured instead of inherited so the caller decides which stream each line goes to;
 * `agn --json` would otherwise have the daemon's start line in the middle of its JSON. A non-zero
 * exit is an answer rather than a failure - `agn daemon status` exits 1 when the daemon is
 * stopped, having said so on stdout - so this never throws on the code.
 */
export async function runDaemonCommand(
  entry: DaemonEntry,
  args: string[],
  opts: { env?: Record<string, string> } = {},
): Promise<DaemonRun> {
  const [command = process.execPath, ...rest] = entry.argv;
  const child = spawn(command, [...rest, ...args], opts.env === undefined ? {} : { env: opts.env });
  const finished: ChildOutcome = await child.then(
    (result) => result,
    (cause: unknown) => cause as ChildOutcome,
  );
  const exited = typeof finished.exitCode === "number";
  return {
    exitCode: exited ? Number(finished.exitCode) : 1,
    stdout: text(finished.stdout),
    // A daemon that never started has no stderr of its own, only the reason it could not be run.
    stderr: text(finished.stderr) || (exited ? "" : reason(finished)),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function reason(finished: ChildOutcome): string {
  return finished instanceof Error ? finished.message : "";
}
