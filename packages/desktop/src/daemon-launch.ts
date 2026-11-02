import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type AgnosticPaths,
  type DaemonInfo,
  probeDaemon,
  type run,
  spawn as spawnProcess,
} from "@agnostic/core";

const WAIT_MS = 10_000;
const POLL_MS = 100;

/** The bundle's daemon under the app's own binary, which `ELECTRON_RUN_AS_NODE` turns into Node. */
export function daemonArgv(appRoot: string, execPath: string = process.execPath): string[] {
  return [execPath, daemonScript(appRoot), "run"];
}

export function daemonEnv(shellEnv: Record<string, string>, home: string): Record<string, string> {
  return { ...shellEnv, ELECTRON_RUN_AS_NODE: "1", AGNOSTIC_HOME: home };
}

export type EnsureResult =
  | { kind: "running"; info: DaemonInfo; reused: boolean }
  | { kind: "foreign"; home: string; port: number }
  | { kind: "failed"; logFile: string };

/**
 * `startDaemon` in the daemon package, with one difference: it spawns `run` with the inherited
 * env, which core scrubs of `ELECTRON_RUN_AS_NODE`, so the app spawns with an explicit env. A
 * daemon `agn` started is reused; a stale `daemon.json` goes first so the wait reads the new one
 * (ADR 005); a port held for another home is reported and left alone.
 */
export async function ensureDaemon(opts: {
  paths: AgnosticPaths;
  argv: string[];
  env: Record<string, string>;
  probe?: typeof probeDaemon;
  spawn?: typeof spawnProcess;
  waitMs?: number;
}): Promise<EnsureResult> {
  const probe = opts.probe ?? probeDaemon;
  const found = await probe(opts.paths);
  if (found.state === "running") {
    // probeDaemon answers "running" only after reading daemon.json, so info is always there.
    return found.info === null
      ? { kind: "failed", logFile: join(opts.paths.logs, "agnd.log") }
      : { kind: "running", info: found.info, reused: true };
  }
  if (found.state === "foreign") {
    const home = found.health?.home ?? "another state directory";
    return { kind: "foreign", home, port: found.info?.port ?? 0 };
  }
  if (found.state === "stale") {
    await rm(opts.paths.daemon, { force: true });
  }
  const logFile = join(opts.paths.logs, "agnd.log");
  const [command = process.execPath, ...args] = opts.argv;
  const child = (opts.spawn ?? spawnProcess)(command, args, {
    detached: true,
    inheritEnv: false,
    env: opts.env,
    logFile,
  });
  child.unref();
  // A daemon that dies at start says why in its log; the wait below turns that into "failed".
  child.catch(() => undefined);
  const info = await waitForRunning(opts.paths, probe, opts.waitMs ?? WAIT_MS);
  return info === null ? { kind: "failed", logFile } : { kind: "running", info, reused: false };
}

/** `agnd stop` from the bundle under Electron's Node; the menu's Quit and Stop Daemon. */
export async function stopDaemon(opts: {
  appRoot: string;
  env: Record<string, string>;
  run: typeof run;
}): Promise<void> {
  await opts.run(process.execPath, [daemonScript(opts.appRoot), "stop"], {
    env: opts.env,
    inheritEnv: false,
  });
}

function daemonScript(appRoot: string): string {
  return join(appRoot, "agnd", "agnd.js");
}

async function waitForRunning(
  paths: AgnosticPaths,
  probe: typeof probeDaemon,
  waitMs: number,
): Promise<DaemonInfo | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const attempt = await probe(paths);
    if (attempt.state === "running" && attempt.info !== null) {
      return attempt.info;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}
