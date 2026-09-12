import { fileURLToPath } from "node:url";
import { type AgnosticPaths, agnosticPaths, type DaemonClient, type spawn } from "@agnostic/core";
import type { CliContext } from "./context.js";
import type { DaemonEntry } from "./daemon-entry.js";

type TestCli = { ctx: CliContext; out: string[]; err: string[] };

/** The stub bin the daemon-entry tests run instead of the real daemon. */
export function stubEntry(): DaemonEntry {
  const main = fileURLToPath(
    new URL("../../../tests/fixtures/bin/agnd-stub/main.mjs", import.meta.url),
  );
  return { argv: [process.execPath, main] };
}

/** Nothing in a CLI test starts a process unless that test says how. */
const refuseToSpawn: typeof spawn = (command) => {
  throw new Error(`a test spawned ${command} without injecting a spawn`);
};

/** A context whose output is two arrays and whose daemon is whatever the test passes in. */
export function createTestContext(
  opts: {
    client?: Partial<DaemonClient>;
    cwd?: string;
    paths?: AgnosticPaths;
    env?: Record<string, string>;
    spawn?: typeof spawn;
  } = {},
): TestCli {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: CliContext = {
    paths: opts.paths ?? agnosticPaths("/tmp/agn-test-home"),
    cwd: opts.cwd ?? "/work",
    env: opts.env ?? { PATH: "/usr/bin" },
    json: false,
    exitCode: 0,
    io: { out: (line) => out.push(line), err: (line) => err.push(line) },
    entry: stubEntry(),
    spawn: opts.spawn ?? refuseToSpawn,
    client: () => Promise.resolve(opts.client as DaemonClient),
  };
  return { ctx, out, err };
}
