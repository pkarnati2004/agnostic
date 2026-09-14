#!/usr/bin/env node
import { agnosticPaths, scrubEnv, spawn } from "@agnostic/core";
import { createContext } from "./context.js";
import { resolveDaemonEntry } from "./daemon-entry.js";
import { runMain } from "./program.js";

// A reader that stops early - `agn status | head` - closes the pipe while agn is still writing.
// That is the reader's choice, not a failure of the command.
process.stdout.on("error", (cause: NodeJS.ErrnoException) => {
  if (cause.code !== "EPIPE") {
    throw cause;
  }
});

const context = createContext({
  paths: agnosticPaths(),
  cwd: process.cwd(),
  env: scrubEnv(process.env),
  spawn,
  io: {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  },
  entry: resolveDaemonEntry(),
  stdin: process.stdin,
});

process.exitCode = await runMain(process.argv, context);
