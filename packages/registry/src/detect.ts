import { homedir } from "node:os";
import { type Billing, type HarnessId, scrubEnv } from "@agnostic/core";
import { findOnPath, readVersion } from "./detect-binary.js";
import { detectLogin } from "./detect-login.js";
import type { HarnessDefinition, LoginState, Tier } from "./harness-definition.js";
import { harnesses } from "./harness-list.js";
import { type ModelListResult, probeModels } from "./probe-models.js";

const DEFAULT_TIMEOUT_MS = 5_000;

export type HarnessStatus = {
  harness: HarnessId;
  name: string;
  binary: string;
  path: string | null;
  version: string | null;
  login: LoginState;
  billing: Billing;
  /** null unless the harness is installed and tier 1; tier 2 is presence only. */
  models: ModelListResult | null;
  tier: Tier;
};

export type DetectOptions = {
  env?: Record<string, string>;
  home?: string;
  versionTimeoutMs?: number;
  probeTimeoutMs?: number;
};

/**
 * One row per harness in table order. Tier 2 is presence only: some of those TUIs hang on
 * `--version`, and doctor would then take five seconds a row to say nothing useful.
 */
export async function detectHarnesses(opts: DetectOptions = {}): Promise<HarnessStatus[]> {
  const env = opts.env ?? scrubEnv(process.env);
  const home = opts.home ?? homedir();
  const path = env.PATH ?? "";
  return Promise.all(harnesses.map((def) => harnessStatus(def, { ...opts, env, home, path })));
}

async function harnessStatus(
  def: HarnessDefinition,
  opts: Required<Pick<DetectOptions, "env" | "home">> & {
    path: string;
    versionTimeoutMs?: number;
    probeTimeoutMs?: number;
  },
): Promise<HarnessStatus> {
  const found = await findOnPath([def.binary, ...def.aliases], opts.path);
  const base = {
    harness: def.id,
    name: def.name,
    binary: def.binary,
    path: found,
    tier: def.tier,
  };
  if (found === null || def.tier !== 1) {
    return { ...base, version: null, login: "unknown", billing: "unknown", models: null };
  }
  const [version, login, models] = await Promise.all([
    readVersion(found, opts.versionTimeoutMs ?? DEFAULT_TIMEOUT_MS),
    detectLogin(def, opts.home),
    probeModels(def, {
      path: found,
      env: opts.env,
      timeoutMs: opts.probeTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    }),
  ]);
  return { ...base, version, login: login.state, billing: login.billing, models };
}
