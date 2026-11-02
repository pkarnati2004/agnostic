import type { run } from "@agnostic/core";

export const ENV_MARKER = "__agnostic_env__";

const ENV_TIMEOUT_MS = 10_000;

/** Where Homebrew puts tmux on Apple silicon and on Intel. */
const FALLBACK_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];

/** `KEY=value` records after the marker, NUL-separated; everything before it is rc-file output. */
export function parseEnvBlock(
  output: string,
  marker: string = ENV_MARKER,
): Record<string, string> | null {
  const start = output.indexOf(marker);
  if (start === -1) {
    return null;
  }
  const env: Record<string, string> = {};
  for (const record of output.slice(start + marker.length).split("\0")) {
    const equals = record.indexOf("=");
    // A record with no name is the empty string after the last NUL, or noise; neither is a variable.
    if (equals > 0) {
      env[record.slice(0, equals)] = record.slice(equals + 1);
    }
  }
  return Object.keys(env).length > 0 ? env : null;
}

/** The app's own env with Homebrew and /usr/local ahead on PATH, once each. */
export function fallbackEnv(base: Record<string, string>): Record<string, string> {
  const rest = (base.PATH ?? "")
    .split(":")
    .filter((dir) => dir !== "" && !FALLBACK_PATHS.includes(dir));
  return { ...base, PATH: [...FALLBACK_PATHS, ...rest].join(":") };
}

/**
 * A Finder-launched app gets launchd's PATH and none of the user's keys, so the daemon would find
 * no tmux and no agent. The login shell's own env is what `agn` in a terminal sees. `env -0`
 * keeps a value with a newline in it whole; the marker separates the env from rc-file chatter.
 */
export async function loginShellEnv(opts: {
  shell: string;
  base: Record<string, string>;
  run: typeof run;
  timeoutMs?: number;
}): Promise<{ env: Record<string, string>; source: "login-shell" | "fallback" }> {
  try {
    const result = await opts.run(
      opts.shell,
      ["-ilc", `printf '%s' ${ENV_MARKER}; command env -0`],
      {
        env: opts.base,
        inheritEnv: false,
        input: "",
        timeoutMs: opts.timeoutMs ?? ENV_TIMEOUT_MS,
      },
    );
    const env = parseEnvBlock(result.stdout);
    if (env !== null) {
      return { env, source: "login-shell" };
    }
  } catch {
    // A shell that hangs on a prompt, exits non-zero or is missing: the caller logs the fallback.
  }
  return { env: fallbackEnv(opts.base), source: "fallback" };
}
