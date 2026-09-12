import type { HarnessId, Plan, PlanVendor, Route } from "@agnostic/core";
import type { Catalog, EntitlementAccess, ModelRow, PlanRow } from "./catalog-schema.js";

/** File order is the order agn offers models in, so the catalog decides what comes first. */
export function modelRows(catalog: Catalog, harness: HarnessId, route: Route): ModelRow[] {
  return catalog.models.filter((row) => row.harness === harness && row.route === route);
}

/** null when the catalog says nothing about this model on this plan, which is not "unavailable". */
export function entitlement(
  catalog: Catalog,
  harness: HarnessId,
  model: string,
  plan: Plan,
): EntitlementAccess | null {
  const row = catalog.entitlements.find(
    (candidate) =>
      candidate.harness === harness && candidate.model === model && candidate.plan === plan,
  );
  return row?.access ?? null;
}

export function plansForVendor(catalog: Catalog, vendor: PlanVendor): PlanRow[] {
  return catalog.plans.filter((row) => row.vendor === vendor);
}

/** A plan agn has no rows for is shown as it was read; it never stands in for a plan agn knows. */
export function knowsPlan(catalog: Catalog, vendor: PlanVendor, plan: Plan): boolean {
  return catalog.plans.some((row) => row.vendor === vendor && row.id === plan);
}
