import type { Readable } from "node:stream";
import type { AgnosticPaths, DaemonClient, spawn } from "@agnostic/core";
import { connect } from "./daemon-connect.js";
import type { DaemonEntry } from "./daemon-entry.js";

/** Every line the CLI prints goes through here, so a test reads output as an array of strings. */
export type Output = { out(line: string): void; err(line: string): void };

export type CliContext = {
  paths: AgnosticPaths;
  cwd: string;
  /** The environment a command hands to a child process, `agn attach` being the only one so far. */
  env: Record<string, string>;
  json: boolean;
  /** `agn daemon status` reports the daemon's state through its code, so a command may set it. */
  exitCode: number;
  io: Output;
  entry: DaemonEntry;
  /** The doctor prompt asks a question of it; `agn handoff --note -` reads it to the end. */
  stdin: Stdin;
  /** Injected so a test can watch `agn attach` hand the terminal over without running tmux. */
  spawn: typeof spawn;
  client(): Promise<DaemonClient>;
};

/** `process.stdin`, narrowed to what a prompt needs, so a test can hand over a fake one. */
export type Stdin = Readable & { isTTY?: boolean };

/** The client is lazy and memoised: a command that needs no daemon never starts one. */
export function createContext(opts: {
  paths: AgnosticPaths;
  cwd: string;
  env: Record<string, string>;
  io: Output;
  entry: DaemonEntry;
  stdin: Stdin;
  spawn: typeof spawn;
}): CliContext {
  let pending: Promise<DaemonClient> | null = null;
  return {
    paths: opts.paths,
    cwd: opts.cwd,
    env: opts.env,
    spawn: opts.spawn,
    json: false,
    exitCode: 0,
    io: opts.io,
    entry: opts.entry,
    stdin: opts.stdin,
    client: () => {
      pending ??= connect({ paths: opts.paths, entry: opts.entry, io: opts.io });
      return pending;
    },
  };
}

/** Pretty-printed and line by line, so `--json` output is the same bytes on a TTY and in a pipe. */
export function writeJson(io: Output, value: unknown): void {
  for (const line of JSON.stringify(value, null, 2).split("\n")) {
    io.out(line);
  }
}
