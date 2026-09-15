import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type AgnosticPaths, run } from "@agnostic/core";

const INFOCMP_TIMEOUT_MS = 5_000;

/**
 * tmux reads a config only when its server starts, and agn's server is started by the executor,
 * so these three settings are what every agn pane runs with. The defaults left out matter: the
 * 500 ms `escape-time` makes Esc lag in every TUI harness, and the status bar costs a row of the
 * browser pane and of `agn attach`.
 */
export function tmuxConfig(terminal: string): string {
  return `# Written by agn at every daemon start; edits do not survive. agn's tmux server never reads ~/.tmux.conf.
set -g default-terminal "${terminal}"
set -s escape-time 0
set -g status off
`;
}

/** Runs before any client agn builds, so `-f` never names a file that is not there yet. */
export async function ensureTmuxConfig(paths: AgnosticPaths): Promise<string> {
  mkdirSync(dirname(paths.tmuxConf), { recursive: true });
  writeFileSync(paths.tmuxConf, tmuxConfig(await defaultTerminal()), "utf8");
  return paths.tmuxConf;
}

/**
 * `tmux-256color` is the better entry but it is missing from the terminfo database shipped with
 * macOS and with slim Linux images, and a default-terminal terminfo cannot resolve takes every
 * pane on the server down with it. `screen-256color` is everywhere.
 */
async function defaultTerminal(): Promise<string> {
  try {
    await run("infocmp", ["tmux-256color"], { timeoutMs: INFOCMP_TIMEOUT_MS });
    return "tmux-256color";
  } catch {
    // Any failure - no entry, no infocmp, a timeout - is read as "this machine does not have it".
    return "screen-256color";
  }
}
