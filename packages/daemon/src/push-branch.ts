import { ProcessError, run } from "@agnostic/core";
import { DaemonError } from "./error.js";

// A push over ssh or https can be slow on a large branch, and there is nothing to fall back on.
const PUSH_TIMEOUT_MS = 120_000;

/** What git says when the remote has commits this branch does not: the one case agn can advise on. */
const BEHIND = /rejected|non-fast-forward|fetch first/i;

/** `--porcelain` writes one line per ref: a flag, the refs, then git's summary of what it did. */
const REF_LINE = /^([ +\-*!=])\t\S+\t?(.*)$/;

export type PushResult = { pushed: boolean };

/**
 * The one command in agn that writes to a remote: `git push --porcelain [--set-upstream] origin
 * <branch>`, never forced and never to another remote. git uses its own credentials, and is told
 * not to ask for them: nobody is at the daemon's terminal to answer.
 */
export async function pushBranch(
  cwd: string,
  branch: string,
  hasUpstream: boolean,
  env: Record<string, string>,
): Promise<PushResult> {
  const upstream = hasUpstream ? [] : ["--set-upstream"];
  const args = ["-C", cwd, "push", "--porcelain", ...upstream, "origin", branch];
  let stdout: string;
  try {
    stdout = (
      await run("git", args, {
        // The daemon's own environment, as every other command agn runs: git's credential helpers
        // and its PATH are the ones agnd was started with, not this process's defaults.
        env: { ...env, GIT_TERMINAL_PROMPT: "0" },
        inheritEnv: false,
        timeoutMs: PUSH_TIMEOUT_MS,
      })
    ).stdout;
  } catch (cause) {
    throw refused(branch, cwd, cause);
  }
  // Only "=" is "the remote already had this"; anything else git accepted moved the branch.
  return { pushed: flagOf(stdout) !== "=" };
}

function refused(branch: string, cwd: string, cause: unknown): DaemonError {
  const error = cause instanceof ProcessError ? cause : null;
  const porcelain = summaryOf(error?.stdout ?? "");
  const said = error?.stderr || porcelain || reason(cause);
  return new DaemonError(`git refused to push ${branch}: ${said}`, {
    code: "push-rejected",
    hint: BEHIND.test(`${error?.stderr ?? ""} ${porcelain}`)
      ? "Bring the branch up to date first (`agn update <task>` or the panel's button), then try again."
      : `Run \`git push\` in ${cwd} to see git's answer.`,
    cause,
  });
}

function flagOf(stdout: string): string | null {
  return refLine(stdout)?.[1] ?? null;
}

function summaryOf(stdout: string): string {
  return refLine(stdout)?.[2]?.trim() ?? "";
}

function refLine(stdout: string): RegExpExecArray | null {
  for (const line of stdout.split("\n")) {
    const match = REF_LINE.exec(line);
    if (match !== null) {
      return match;
    }
  }
  return null;
}

function reason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
