import { homedir } from "node:os";
import type { ModelRow } from "@agnostic/catalog";
import { type Billing, type HarnessId, type Plan, scrubEnv } from "@agnostic/core";
import { findOnPath, readVersion } from "./detect-binary.js";
import { detectLogin } from "./detect-login.js";
import { detectPlan } from "./detect-plan.js";
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
  /** What the harness's own files say the user pays for; null when nothing said so. */
  plan: Plan | null;
  tier: Tier;
};

export type DetectOptions = {
  env?: Record<string, string>;
  home?: string;
  versionTimeoutMs?: number;
  probeTimeoutMs?: number;
  /** The catalog's model rows; the native ones seed a harness whose own probe says nothing. */
  models?: ModelRow[];
};

/**
 * One row per harness in table order. Tier 2 is presence only: some of those TUIs hang on
 * `--version`, and doctor would then take five seconds a row to say nothing useful.
 */
export async function detectHarnesses(opts: DetectOptions = {}): Promise<HarnessStatus[]> {
  const env = opts.env ?? scrubEnv(process.env);
  const home = opts.home ?? homedir();
  const path = env.PATH ?? "";
  const models = opts.models ?? [];
  return Promise.all(
    harnesses.map((def) => harnessStatus(def, { ...opts, env, home, path, models })),
  );
}

async function harnessStatus(
  def: HarnessDefinition,
  opts: Required<Pick<DetectOptions, "env" | "home" | "models">> & {
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
    return {
      ...base,
      version: null,
      login: "unknown",
      billing: "unknown",
      models: null,
      plan: null,
    };
  }
  const [version, login, models, plan] = await Promise.all([
    readVersion(found, opts.versionTimeoutMs ?? DEFAULT_TIMEOUT_MS),
    detectLogin(def, opts.home),
    probeModels(def, {
      path: found,
      env: opts.env,
      timeoutMs: opts.probeTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      seeds: seedsFor(def, opts.models),
    }),
    detectPlan(def, opts.home),
  ]);
  return { ...base, version, login: login.state, billing: login.billing, models, plan };
}

/** A harness is seeded with the models the catalog lists for it on its own route. */
function seedsFor(def: HarnessDefinition, models: ModelRow[]): string[] {
  return models
    .filter((row) => row.harness === def.id && row.route === "native")
    .map((row) => row.model);
}
