import { run } from "@agnostic/core";
import type { HarnessDefinition } from "./harness-definition.js";
import { seedModels } from "./seed-models.js";

/**
 * Ported from Orca's model discovery runtime (`src/main/text-generation/
 * commit-message-model-discovery.ts`, `commit-message-model-discovery-policy.ts`).
 * MIT License, Copyright (c) Lovecast Inc.
 */

const PROBE_TIMEOUT_MS = 5_000;

/** A harness that answers with a megabyte is broken, not verbose; we do not parse the flood. */
const MAX_OUTPUT_BYTES = 1024 * 1024;

export type ModelListResult = {
  models: string[];
  origin: "probe" | "seed" | "none";
  /** Why the probe was not used; null only when `origin` is `"probe"`. */
  error: string | null;
};

type ProbeOptions = {
  path: string;
  timeoutMs?: number;
  env?: Record<string, string>;
};

/**
 * Asks an installed harness for its own model list, falling back to the seed rows. Anything the
 * harness does wrong - no list command, a crash, a hang, a flood, an empty answer - is a reason
 * in `error`, never a throw: doctor still has a list to show.
 */
export async function probeModels(
  def: HarnessDefinition,
  opts: ProbeOptions,
): Promise<ModelListResult> {
  const probe = def.modelSource;
  if (!probe) {
    return fallback(def, `${def.name} has no model list command`);
  }
  let output: { stdout: string; stderr: string };
  try {
    output = await run(opts.path, probe.args, {
      ...(probe.stdin === null ? {} : { input: probe.stdin }),
      ...(opts.env ? { env: opts.env } : {}),
      timeoutMs: opts.timeoutMs ?? PROBE_TIMEOUT_MS,
    });
  } catch (cause) {
    return fallback(def, cause instanceof Error ? cause.message : String(cause));
  }
  if (output.stdout.length + output.stderr.length > MAX_OUTPUT_BYTES) {
    return fallback(def, `${def.name} printed more than 1 MiB of model list`);
  }
  // Some CLIs write their listing to stderr; stdout is still the one that should answer.
  const listed = probe.parse(output.stdout);
  const models = listed.length > 0 ? listed : probe.parse(output.stderr);
  if (models.length === 0) {
    return fallback(def, `${def.name} listed no models`);
  }
  return { models, origin: "probe", error: null };
}

function fallback(def: HarnessDefinition, error: string): ModelListResult {
  const seeds = seedModels(def.id, "native").map((seed) => seed.model);
  return {
    models: seeds,
    origin: seeds.length > 0 ? "seed" : "none",
    error,
  };
}
