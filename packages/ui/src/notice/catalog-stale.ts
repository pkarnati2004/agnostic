import type { CatalogSummary } from "@agnostic/core";

const DAY_MS = 86_400_000;

// The daily check has room for a weekend and a Monday morning before the page says anything.
const STALE_DAYS = 7;

const TAIL = " Recommendations use the current data until you run `agn catalog update`.";

/**
 * What to say about the catalog, or null for nothing to say. A machine with the daily check turned
 * off is not behind, it opted out, so it hears nothing; a check that failed is worth saying whenever
 * it happened, because the daemon has stopped looking until tomorrow (ADR 024).
 */
export function catalogStaleLine(summary: CatalogSummary, now: number): string | null {
  if (!summary.checkEnabled) {
    return null;
  }
  const last = summary.lastCheck;
  if (last === null) {
    return `The catalog has never been checked.${TAIL}`;
  }
  if (last.outcome === "failed") {
    return `The last catalog check failed: ${last.message ?? "no reason given"}.${TAIL}`;
  }
  const days = Math.floor((now - Date.parse(last.checkedAt)) / DAY_MS);
  if (days < STALE_DAYS) {
    return null;
  }
  return `Catalog last checked ${days} days ago.${TAIL}`;
}
