import type { PlanRow } from "@agnostic/catalog";
import type { Plan, PlanVendor } from "@agnostic/core";

/** The plan agn bills against, and the detected name it set aside to get there. */
export type PlanChoice = {
  value: Plan;
  source: "detected" | "config";
  /** False for a plan the catalog has no row for: agn shows it but cannot say what it includes. */
  known: boolean;
  /** The name the harness reported, when config.yaml overrode it; null otherwise. */
  overridden: Plan | null;
};

/**
 * Which plan wins (ADR 016, amended): what the harness reports, unless the catalog has no row for
 * it and config.yaml names one. A harness that renames a plan agn does not know yet must not cost
 * the user the entitlements they told agn about.
 */
export function resolvePlan(
  detected: Plan | null,
  configured: Plan | undefined,
  vendor: PlanVendor,
  catalogPlans: PlanRow[],
): PlanChoice | null {
  const known = (plan: Plan) =>
    catalogPlans.some((row) => row.vendor === vendor && row.id === plan);
  if (detected !== null && (known(detected) || configured === undefined)) {
    return { value: detected, source: "detected", known: known(detected), overridden: null };
  }
  if (configured === undefined) {
    return null;
  }
  return { value: configured, source: "config", known: known(configured), overridden: detected };
}
