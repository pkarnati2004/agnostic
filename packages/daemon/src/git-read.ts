import { ProcessError, run } from "@agnostic/core";

const GIT_TIMEOUT_MS = 30_000;

/** What git printed, or null when it refused: a non-zero exit, or a git that would not run. */
export async function gitStdout(cwd: string, args: string[]): Promise<string | null> {
  const result = await gitResult(cwd, args);
  return result === null || result.exitCode !== 0 ? null : result.stdout;
}

/**
 * git's own answer, exit code included, for the questions it answers with a code or on stdout
 * while exiting non-zero (`merge-base --is-ancestor`, `diff --no-index`). Null is reserved for a
 * git that never ran - ENOENT, a timeout, a signal - so a caller can tell "no" from "unknown".
 */
export async function gitResult(
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
  try {
    const { exitCode, stdout, stderr } = await run("git", ["-C", cwd, ...args], {
      timeoutMs: GIT_TIMEOUT_MS,
    });
    return { exitCode, stdout, stderr };
  } catch (cause) {
    if (cause instanceof ProcessError && cause.exitCode !== null) {
      return { exitCode: cause.exitCode, stdout: cause.stdout, stderr: cause.stderr };
    }
    return null;
  }
}

export function gitLines(stdout: string | null): string[] {
  return (stdout ?? "").split("\n").filter((line) => line.trim() !== "");
}

/** The URL of the repo's `origin` remote, or null when it has none. */
export async function originUrl(cwd: string): Promise<string | null> {
  return gitLines(await gitStdout(cwd, ["remote", "get-url", "origin"]))[0] ?? null;
}
