import { readFile, realpath } from "node:fs/promises";
import {
  type DaemonInfo,
  DaemonInfoSchema,
  type HealthResponse,
  HealthResponseSchema,
} from "./daemon-api.js";
import { DaemonApiError } from "./error.js";
import { type AgnosticPaths, agnosticPaths } from "./paths.js";
import { isProcessAlive } from "./process.js";
import { readTextFile } from "./read-text-file.js";

const HEALTH_TIMEOUT_MS = 2_000;
const START_HINT = "Run `agn daemon start`.";

export async function readAuthToken(paths: AgnosticPaths = agnosticPaths()): Promise<string> {
  const token = await readTextFile(paths.authToken);
  if (token === null || token.trim() === "") {
    throw new DaemonApiError(`no auth token at ${paths.authToken}`, {
      code: "auth-token-missing",
      hint: START_HINT,
      status: null,
    });
  }
  return token.trim();
}

/** Null when the file is missing or was written by something else; the caller then probes. */
export async function readDaemonInfo(
  paths: AgnosticPaths = agnosticPaths(),
): Promise<DaemonInfo | null> {
  let text: string;
  try {
    text = await readFile(paths.daemon, "utf8");
  } catch {
    // No file is a daemon that has never run here; the caller probes the port anyway.
    return null;
  }
  try {
    return DaemonInfoSchema.parse(JSON.parse(text));
  } catch {
    // A half-written or foreign file says nothing about the daemon: the probe decides.
    return null;
  }
}

export type DaemonProbe = {
  /** `foreign`: something answers as agnd on that port, but it serves another state directory. */
  state: "running" | "stale" | "stopped" | "foreign";
  info: DaemonInfo | null;
  health: HealthResponse | null;
};

/**
 * ADR 005: daemon.json is a hint. A file with a dead pid, a port that does not answer, or a
 * daemon answering with a different pid is stale, and stale is what `restart --force` cleans up.
 * A daemon that answers for a different home is foreign: it belongs to another `AGNOSTIC_HOME`
 * and is never this one's to kill.
 */
export async function probeDaemon(
  paths: AgnosticPaths = agnosticPaths(),
  timeoutMs: number = HEALTH_TIMEOUT_MS,
): Promise<DaemonProbe> {
  const info = await readDaemonInfo(paths);
  if (info === null) {
    return { state: "stopped", info: null, health: null };
  }
  // The port is asked even when the file's pid is dead: something else may be holding it, and
  // `restart --force` has to know which process is actually answering before it starts another.
  const health = await readHealth(info.port, timeoutMs);
  if (health === null) {
    return { state: "stale", info, health };
  }
  if (!(await servesHome(health, paths))) {
    return { state: "foreign", info, health };
  }
  if (!isProcessAlive(info.pid) || health.pid !== info.pid) {
    return { state: "stale", info, health };
  }
  return { state: "running", info, health };
}

/**
 * Whether the daemon answering is the one for these paths. Realpaths, because `/tmp` and
 * `/private/tmp` are the same directory on macOS; an answer with no home at all is not ours.
 */
export async function servesHome(health: HealthResponse, paths: AgnosticPaths): Promise<boolean> {
  if (health.home === undefined) {
    return false;
  }
  const [theirs, ours] = await Promise.all([resolveReal(health.home), resolveReal(paths.home)]);
  return theirs === ours;
}

async function resolveReal(path: string): Promise<string> {
  // A home that does not exist yet cannot be resolved, and the raw path is the best answer there.
  return realpath(path).catch(() => path);
}

async function readHealth(port: number, timeoutMs: number): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    return HealthResponseSchema.parse(await response.json());
  } catch {
    // Refused, timed out, or answered with something else: nothing is listening as agnd.
    return null;
  }
}
