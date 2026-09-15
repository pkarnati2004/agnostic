import { ProcessError, type spawn } from "@agnostic/core";
import type { CliContext } from "./context.js";

/**
 * How long a launch gets to fail in. `open` reports a missing application in milliseconds, and a
 * PATH shim that is still alive after three seconds is an editor that stayed in the foreground.
 */
const FAILURE_WINDOW_MS = 3_000;

/**
 * Detached and with agn's own environment, so what it starts joins the user's login session and
 * outlives the command (ADR 023). agn waits out the failure window before it lets go, and throws
 * the child's own words; the caller says what failed.
 */
export async function launchDetached(
  ctx: CliContext,
  argv: string[],
  logFile: string,
): Promise<void> {
  const [command, ...args] = argv;
  if (command === undefined) {
    throw new Error("there is no command to run");
  }
  const child = ctx.spawn(command, args, {
    detached: true,
    inheritEnv: false,
    env: ctx.env,
    logFile,
  });
  const failure = await earlyFailure(child, FAILURE_WINDOW_MS);
  if (failure !== null) {
    throw new Error(failure);
  }
  child.unref();
}

/** Why the child died inside the window, or null: it exited cleanly, or it is still running. */
async function earlyFailure(
  child: ReturnType<typeof spawn>,
  windowMs: number,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const window = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), windowMs);
  });
  try {
    // `.then` here is also what keeps a later failure from becoming an unhandled rejection.
    return await Promise.race([
      child.then(
        () => null,
        (cause: unknown) => reason(cause),
      ),
      window,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Output goes to the log file, so a ProcessError usually carries no stderr of its own.
function reason(cause: unknown): string {
  if (cause instanceof ProcessError && cause.stderr !== "") {
    return cause.stderr;
  }
  return cause instanceof Error ? cause.message : String(cause);
}
