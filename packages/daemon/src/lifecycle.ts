import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type AgnosticPaths,
  agnosticHome,
  agnosticPaths,
  type DaemonInfo,
  type DaemonProbe,
  isProcessAlive,
  probeDaemon,
  spawn,
} from "@agnostic/core";
import { DaemonError } from "./error.js";

const HEALTH_WAIT_MS = 5_000;
const EXIT_WAIT_MS = 5_000;
const POLL_MS = 100;
const LOG_TAIL_LINES = 20;

/**
 * Starts `agnd run` as its own process group with both streams in the log, then waits for the
 * daemon to answer on `/health`. A stale `daemon.json` is deleted first so the wait cannot
 * mistake the previous daemon's file for the new one's (ADR 005).
 */
export async function startDaemon(opts: {
  home?: string;
  port?: number;
  entry: string[];
}): Promise<DaemonInfo> {
  const paths = pathsFor(opts.home);
  const probe = await probeDaemon(paths);
  if (probe.state === "running") {
    throw new DaemonError(`agnd is already running on port ${probe.info?.port}`, {
      code: "daemon-already-running",
      hint: "Run `agn daemon restart` to replace it.",
    });
  }
  await rm(paths.daemon, { force: true });

  const logFile = join(paths.logs, "agnd.log");
  const [command = process.execPath, ...rest] = opts.entry;
  const args = [...rest, "run", ...(opts.port === undefined ? [] : ["--port", String(opts.port)])];
  const child = spawn(command, args, {
    detached: true,
    logFile,
    env: { AGNOSTIC_HOME: paths.home },
  });
  child.unref();

  const started = await waitFor(HEALTH_WAIT_MS, async () => {
    const attempt = await probeDaemon(paths);
    return attempt.state === "running" ? attempt.info : null;
  });
  if (started === null) {
    const seconds = HEALTH_WAIT_MS / 1000;
    throw new DaemonError(`agnd did not answer within ${seconds}s\n${await tail(logFile)}`, {
      code: "daemon-start-failed",
      hint: `The whole log is at ${logFile}.`,
    });
  }
  return started;
}

export async function stopDaemon(opts: { home?: string }): Promise<void> {
  const paths = pathsFor(opts.home);
  const probe = await probeDaemon(paths);
  if (probe.info === null) {
    throw new DaemonError("agnd is not running", {
      code: "daemon-not-running",
      hint: "Run `agn daemon start` first.",
    });
  }
  await end(probe.info.pid);
  await rm(paths.daemon, { force: true });
}

/** `--force` is for the case `stop` cannot handle: a pid that is alive but no longer answering. */
export async function restartDaemon(opts: {
  home?: string;
  port?: number;
  force?: boolean;
  entry: string[];
}): Promise<DaemonInfo> {
  const paths = pathsFor(opts.home);
  if (opts.force === true) {
    const probe = await probeDaemon(paths);
    refuseForeign(probe, paths);
    for (const pid of held(probe)) {
      kill(pid, "SIGKILL");
      await waitFor(EXIT_WAIT_MS, () => Promise.resolve(isProcessAlive(pid) ? null : true));
    }
    await rm(paths.daemon, { force: true });
  } else {
    await stopDaemon(opts).catch(rethrowUnlessStopped);
  }
  return startDaemon(opts);
}

/**
 * A daemon on our port that serves another state directory is somebody else's: probably the same
 * user with a second `AGNOSTIC_HOME`. `--force` says "end the daemon that is in my way", not "end
 * whatever holds this port", so it stops here and names the other home.
 */
function refuseForeign(probe: DaemonProbe, paths: AgnosticPaths): void {
  if (probe.state !== "foreign") {
    return;
  }
  const home = probe.health?.home ?? "another state directory";
  throw new DaemonError(
    `port ${probe.info?.port ?? "?"} is held by an agn daemon for ${home}, not for ${paths.home}`,
    {
      code: "daemon-foreign-port",
      hint: "Stop that daemon where it lives, or start this one on another port with --port.",
    },
  );
}

/**
 * Which processes `--force` has to end before the port is free. Two pids can be in play: the one
 * `daemon.json` names, and the one answering `/health` when the file is stale. The answering pid
 * is killed only because it answered as agnd on that port - never because of its name - and
 * killing only the file's pid would leave the live daemon holding the port `start` needs.
 */
function held(probe: DaemonProbe): number[] {
  const pids = new Set<number>();
  for (const pid of [probe.info?.pid, probe.health?.pid]) {
    if (pid !== undefined && isProcessAlive(pid)) {
      pids.add(pid);
    }
  }
  return [...pids];
}

export function daemonStatus(opts: { home?: string }): Promise<DaemonProbe> {
  return probeDaemon(pathsFor(opts.home));
}

function pathsFor(home: string | undefined): AgnosticPaths {
  return agnosticPaths(home === undefined ? agnosticHome() : resolve(home));
}

async function end(pid: number): Promise<void> {
  kill(pid, "SIGTERM");
  const gone = await waitFor(EXIT_WAIT_MS, () =>
    Promise.resolve(isProcessAlive(pid) ? null : true),
  );
  if (gone === null) {
    kill(pid, "SIGKILL");
  }
}

function kill(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (cause) {
    // Already gone is the outcome we wanted; anything else is a real problem.
    if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) {
      throw cause;
    }
  }
}

async function waitFor<T>(timeoutMs: number, attempt: () => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await attempt();
    if (result !== null) {
      return result;
    }
    if (Date.now() >= deadline) {
      return null;
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}

async function tail(file: string): Promise<string> {
  const text = await readFile(file, "utf8").catch(() => "");
  return text.trimEnd().split("\n").slice(-LOG_TAIL_LINES).join("\n");
}

function rethrowUnlessStopped(cause: unknown): void {
  if (!(cause instanceof DaemonError) || cause.code !== "daemon-not-running") {
    throw cause;
  }
}
