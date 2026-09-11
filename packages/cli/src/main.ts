#!/usr/bin/env node
import { agnosticPaths } from "@agnostic/core";
import { createContext } from "./context.js";
import { resolveDaemonEntry } from "./daemon-entry.js";
import { runMain } from "./program.js";

const context = createContext({
  paths: agnosticPaths(),
  cwd: process.cwd(),
  io: {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  },
  entry: resolveDaemonEntry(),
});

process.exitCode = await runMain(process.argv, context);
