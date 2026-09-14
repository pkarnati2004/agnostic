import type { Catalog, PricingRow } from "@agnostic/catalog";
import type { Profile, TaskScope } from "@agnostic/core";
import { canonicalModel } from "./canonical-model.js";

/** What a task of each size is assumed to read and write, until a repo has token counts of its own. */
const TOKENS_BY_SCOPE: Record<TaskScope, number> = {
  small: 150_000,
  medium: 400_000,
  large: 1_000_000,
};

/** A coding agent reads far more than it writes; this is the mix the estimate assumes. */
const INPUT_SHARE = 0.9;

const PER_MILLION = 1_000_000;

/**
 * What this task would add to the bill. Null is "nothing extra": a subscription the user already
 * pays for, or a model on their own machine. `credits` is priced like an API key, because that is
 * what it is - metered usage on the user's login (ADR 016).
 */
export function marginalCostUsd(
  catalog: Catalog,
  profile: Profile,
  scope: TaskScope,
): number | null {
  if (profile.billing === "subscription" || profile.billing === "local") {
    return null;
  }
  const model = canonicalModel(catalog, profile);
  const row = catalog.pricing.find((candidate) => candidate.model === model);
  // An unpriced model is charged at the dearest rate agn knows, so a guess never looks cheap.
  const price = row === undefined ? Math.max(0, ...catalog.pricing.map(blended)) : blended(row);
  return TOKENS_BY_SCOPE[scope] * price;
}

function blended(row: PricingRow): number {
  return (
    (INPUT_SHARE * row.inputPerMillion + (1 - INPUT_SHARE) * row.outputPerMillion) / PER_MILLION
  );
}
