import type { AgnosticPaths, DaemonClient } from "@agnostic/core";
import { connect } from "./daemon-connect.js";
import type { DaemonEntry } from "./daemon-entry.js";

/** Every line the CLI prints goes through here, so a test reads output as an array of strings. */
export type Output = { out(line: string): void; err(line: string): void };

export type CliContext = {
  paths: AgnosticPaths;
  cwd: string;
  json: boolean;
  /** `agn daemon status` reports the daemon's state through its code, so a command may set it. */
  exitCode: number;
  io: Output;
  entry: DaemonEntry;
  client(): Promise<DaemonClient>;
};

/** The client is lazy and memoised: a command that needs no daemon never starts one. */
export function createContext(opts: {
  paths: AgnosticPaths;
  cwd: string;
  io: Output;
  entry: DaemonEntry;
}): CliContext {
  let pending: Promise<DaemonClient> | null = null;
  return {
    paths: opts.paths,
    cwd: opts.cwd,
    json: false,
    exitCode: 0,
    io: opts.io,
    entry: opts.entry,
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
