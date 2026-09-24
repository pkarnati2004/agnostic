import type { Billing, PlanUsage } from "@agnostic/core";

// `@agnostic/core/browser` holds the rules the CLI and the page must agree on. What is below is
// the page's own formatting, restated from `agn usage`; format-usage.test.ts pins the CLI's cases.

// Grouped by hand rather than by locale, so the bar reads the same wherever agn runs.
export function formatCount(tokens: number | null): string {
  return tokens === null ? "-" : String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMoney(costUsd: number | null): string {
  return costUsd === null ? "-" : `$${costUsd.toFixed(2)}`;
}

export function formatShare(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

export function planLabel(row: PlanUsage): string {
  if (row.plan === null) {
    return "unknown plan";
  }
  return row.vendor === null ? String(row.plan) : `${row.vendor} ${row.plan}`;
}

/** A subscription run has no price; saying so is more use than a dash the user has to decode. */
export function formatTaskCost(costUsd: number | null, billing: Billing | null): string {
  if (costUsd === null && (billing === "subscription" || billing === "local")) {
    return "included in plan";
  }
  return formatMoney(costUsd);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
