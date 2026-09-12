import { readFile } from "node:fs/promises";
import { type PrepareInput, ProcessError, run } from "@agnostic/core";
import { ExecutorError } from "./error.js";

const ERROR_TAIL_LINES = 20;

/**
 * Runs the repo's `setup_command` in the new worktree before the harness starts. It is a shell
 * line the user wrote in their own `.ag/agnostic.yaml`, so it goes to `sh -c` as written.
 */
export async function runSetupCommand(input: PrepareInput, cwd: string): Promise<void> {
  const command = input.setupCommand;
  if (command === null) {
    return;
  }
  try {
    await run("/bin/sh", ["-c", command], {
      cwd,
      ...(input.logFile === null ? {} : { logFile: input.logFile }),
    });
  } catch (cause) {
    const output = await lastLines(input.logFile, cause);
    throw new ExecutorError(
      `setup_command failed in ${cwd}: \`${command}\`${output === "" ? "" : `\n${output}`}`,
      {
        code: "setup-failed",
        hint: `Run \`${command}\` in the worktree to see why, or fix setup_command in .ag/agnostic.yaml.`,
        cause,
      },
    );
  }
}

/** The tail of the task log when the output went there, otherwise what the process printed. */
async function lastLines(logFile: string | null, cause: unknown): Promise<string> {
  if (logFile !== null) {
    try {
      const text = await readFile(logFile, "utf8");
      return text.split("\n").slice(-ERROR_TAIL_LINES).join("\n").trim();
    } catch {
      return "";
    }
  }
  return cause instanceof ProcessError ? cause.stderr : "";
}
