import { fileURLToPath } from "node:url";
import { type AgnosticPaths, agnosticPaths, type DaemonClient } from "@agnostic/core";
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

/** A context whose output is two arrays and whose daemon is whatever the test passes in. */
export function createTestContext(
  opts: { client?: Partial<DaemonClient>; cwd?: string; paths?: AgnosticPaths } = {},
): TestCli {
  const out: string[] = [];
  const err: string[] = [];
  const ctx: CliContext = {
    paths: opts.paths ?? agnosticPaths("/tmp/agn-test-home"),
    cwd: opts.cwd ?? "/work",
    json: false,
    exitCode: 0,
    io: { out: (line) => out.push(line), err: (line) => err.push(line) },
    entry: stubEntry(),
    client: () => Promise.resolve(opts.client as DaemonClient),
  };
  return { ctx, out, err };
}
