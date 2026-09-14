import { ProcessError, run } from "@agnostic/core";
import type { Logger } from "./log.js";

/** A user's own command, so it gets the time a slow suite needs and no more (ADR 022). */
const TIMEOUT_MS = 600_000;

/**
 * The repo's `test_command`, run in a worktree through `/bin/sh` with its output appended to the
 * task log. True and false are the command's own verdict; null is "agn has nothing to record" -
 * no command configured, a shell that could not run it, or a run that outlived the timeout. It
 * never throws: a test command is evidence about a task, not a step the task depends on.
 */
export async function runTestCommand(input: {
  command: string | null;
  cwd: string;
  logFile: string | null;
  log: Pick<Logger, "warn">;
  timeoutMs?: number;
}): Promise<boolean | null> {
  if (input.command === null) {
    return null;
  }
  const timeoutMs = input.timeoutMs ?? TIMEOUT_MS;
  try {
    await run("/bin/sh", ["-c", input.command], {
      cwd: input.cwd,
      timeoutMs,
      ...(input.logFile === null ? {} : { logFile: input.logFile }),
    });
    return true;
  } catch (cause) {
    if (cause instanceof ProcessError && cause.code === "process-timeout") {
      // The only silent null worth a line: the suite ran, and agn stopped waiting for its answer.
      input.log.warn("test command timed out", { cwd: input.cwd, timeoutMs });
      return null;
    }
    return cause instanceof ProcessError ? failed(cause) : null;
  }
}

/** 127 is the shell saying the command does not exist, which says nothing about the code. */
function failed(cause: ProcessError): boolean | null {
  if (cause.exitCode === null || cause.exitCode === 127) {
    return null;
  }
  return false;
}
