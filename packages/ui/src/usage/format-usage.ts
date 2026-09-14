import type { Billing, PlanUsage, UsageWindow } from "@agnostic/core";

// The page cannot import `agn usage`'s own formatters - the CLI is not in this bundle - so the
// rules are restated here and format-usage.test.ts pins the CLI's cases against them.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

/** The day the window starts, in the zone the daemon computed it in. */
export function windowHeading(window: UsageWindow): string {
  const since = new Date(window.since);
  const date = [
    since.getFullYear(),
    String(since.getMonth() + 1).padStart(2, "0"),
    String(since.getDate()).padStart(2, "0"),
  ].join("-");
  return window.kind === "day" ? date : `from ${DAYS[since.getDay()]} ${date}`;
}
