import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type AgnosticPaths, run } from "@agnostic/core";
import {
  AGN_SOCKET,
  createTmuxClient,
  listSessions,
  type TmuxClient,
  tmuxClientEnv,
} from "./tmux-client.js";

const INFOCMP_TIMEOUT_MS = 5_000;

/**
 * tmux reads a config only when its server starts, and agn's server is started by the executor,
 * so these four settings are what every agn pane runs with. The defaults left out matter: the
 * 500 ms `escape-time` makes Esc lag in every TUI harness, and the status bar costs a row of the
 * browser pane and of `agn attach`. `mouse on` is what gives the pane scrollback: a harness TUI
 * runs in the alternate screen, where the history is tmux copy-mode and only a wheel event enters
 * it. It costs the plain click-drag selection, which tmux now takes for its own; selecting text
 * in the pane needs the modifier that bypasses mouse reporting (Option in the browser terminal).
 */
export function tmuxConfig(terminal: string): string {
  return marked(`# Written by agn at every daemon start; edits do not survive. agn's tmux server never reads ~/.tmux.conf.
set -g default-terminal "${terminal}"
set -s escape-time 0
set -g status off
set -g mouse on
`);
}

/**
 * The server keeps this user option for as long as it runs, so `agn doctor` can tell a server that
 * started on these settings from one that started before they changed. The value stands for the
 * settings above it and nothing else: it only ever has to differ when they do.
 */
function marked(settings: string): string {
  const hash = createHash("sha256").update(settings).digest("hex").slice(0, 12);
  return `${settings}set -g @agn-config ${hash}\n`;
}

/** The marker in a config file agn wrote; empty for a file from before agn wrote one. */
function markerIn(config: string): string {
  return /^set -g @agn-config (\S+)$/m.exec(config)?.[1] ?? "";
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

/**
 * True when a tmux server is running on agn's socket and did not start on the config agn writes
 * now: tmux reads `-f` only when it starts a server, so that server keeps the settings it began
 * with until its last session ends. No server on the socket is nothing to report.
 */
export async function tmuxConfigStale(opts: {
  paths: AgnosticPaths;
  socketName?: string;
  env?: Record<string, string>;
}): Promise<boolean> {
  const client = createTmuxClient({
    socketName: opts.socketName ?? AGN_SOCKET,
    env: opts.env ?? tmuxClientEnv(),
    configFile: opts.paths.tmuxConf,
  });
  // `agn doctor` runs on machines that are missing things, and a machine with no tmux has no
  // server of agn's either: a client that cannot run at all is "no server", not a failed check.
  const sessions = await listSessions(client).catch(() => [] as string[]);
  if (sessions.length === 0) {
    return false;
  }
  const wanted = markerIn(await readFile(opts.paths.tmuxConf, "utf8").catch(() => ""));
  return (await serverMarker(client)) !== wanted;
}

/** Empty for a server started before agn wrote the marker, which is the answer we want anyway. */
async function serverMarker(client: TmuxClient): Promise<string> {
  const shown = await client.run(["show", "-gv", "@agn-config"], { allowFailure: true });
  return shown.exitCode === 0 ? shown.stdout.trim() : "";
}
