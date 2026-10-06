import { run, type TmuxReport } from "@agnostic/core";

/** Reattach is only reliable from 3.3; the executor's own launch floor is 3.2 and lower (ADR 038). */
export const REATTACH_FLOOR = { major: 3, minor: 3 } as const;

const VERSION_TIMEOUT_MS = 3_000;

/** The builds ahead of every release, which carry no number to compare. */
const UNTAGGED = /^(next|master)/;

const NUMBERED = /^(\d+)\.(\d+)/;

/** `tmux -V` prints "tmux 3.4", "tmux 3.3a" or "tmux next-3.5"; null when it printed none of those. */
export function parseTmuxVersion(stdout: string): string | null {
  return /^tmux\s+(\S+)/.exec(stdout.trim())?.[1] ?? null;
}

/**
 * Whether the word `tmux -V` printed is a version at all. A `tmux` on PATH that answers something
 * with no number in it is a different program, not an old tmux, and callers say so differently.
 */
export function isTmuxVersion(version: string): boolean {
  return UNTAGGED.test(version) || NUMBERED.test(version);
}

/**
 * Whether a version string is at or above a floor. `next` and `master` are builds ahead of every
 * release, and so is `next-3.5`, which is why the leading word is read before the digits. A string
 * with no version in it is below every floor; `isTmuxVersion` is what tells the two apart.
 */
export function tmuxVersionAtLeast(
  version: string,
  floor: { major: number; minor: number },
): boolean {
  if (UNTAGGED.test(version)) {
    return true;
  }
  const parts = NUMBERED.exec(version);
  const major = Number(parts?.[1]);
  const minor = Number(parts?.[2]);
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return false;
  }
  return major > floor.major || (major === floor.major && minor >= floor.minor);
}

/**
 * What to tell the user about their tmux. A machine with no tmux, or one whose `tmux` on PATH
 * answers something else, is `{version: null, ok: false}`: `POST /doctor` reports on machines that
 * are missing things, so nothing here throws.
 */
export async function readTmuxVersion(env: Record<string, string>): Promise<TmuxReport> {
  try {
    // The same shape tmux-client.ts runs with: agn's env, never the shell's, and never a cwd that
    // could be deleted under it.
    const result = await run("tmux", ["-V"], {
      cwd: "/",
      env,
      inheritEnv: false,
      timeoutMs: VERSION_TIMEOUT_MS,
    });
    const version = parseTmuxVersion(result.stdout);
    // A word with no number in it is not a version the row can show, so it reads as unreadable.
    if (version === null || !isTmuxVersion(version)) {
      return { version: null, ok: false };
    }
    return { version, ok: tmuxVersionAtLeast(version, REATTACH_FLOOR) };
  } catch {
    return { version: null, ok: false };
  }
}
