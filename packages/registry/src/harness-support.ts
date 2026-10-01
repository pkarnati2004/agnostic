import type { Support } from "@agnostic/core";
import type { HarnessDefinition } from "./harness-definition.js";

/**
 * What agn can do with a harness, from the two facts the row already carries: a hook makes the
 * status live, a usage source makes the tokens countable. One function, so doctor, the docs and
 * the tests cannot disagree about what a label means.
 */
export function harnessSupport(def: HarnessDefinition): Support {
  if (def.hooks === null) {
    return "basic";
  }
  return def.usageSource === null ? "status" : "full";
}
