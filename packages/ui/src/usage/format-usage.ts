import type { Billing, PlanUsage } from "@agnostic/core";

// The page cannot import `agn usage`'s own formatters - the CLI is not in this bundle - so the
// rules are restated here and format-usage.test.ts pins the CLI's cases against them.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The scales a token count is read at; anything smaller is printed as it is. */
const TOKEN_UNITS = [
  { scale: 1_000_000_000, suffix: "B" },
  { scale: 1_000_000, suffix: "M" },
  { scale: 1_000, suffix: "k" },
];

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

/** The clock time on its own while the reset is today, and the weekday too once it is not. */
export function formatReset(iso: string, now: number): string {
  const at = new Date(iso);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === new Date(now).toDateString() ? time : `${DAYS[at.getDay()]} ${time}`;
}

/**
 * A token count to three significant figures, core's `formatTokens3` restated: the page bundles no
 * runtime code from `@agnostic/core`. `format-usage.test.ts` pins core's own cases against this.
 */
export function formatTokens3(tokens: number | null): string {
  if (tokens === null) {
    return "-";
  }
  const rounded = significant(tokens);
  for (const { scale, suffix } of TOKEN_UNITS) {
    if (Math.abs(rounded) >= scale) {
      return `${decimal(rounded / scale)}${suffix}`;
    }
  }
  return decimal(rounded);
}

/** Rounded before it is scaled, so 999,999 reads 1M rather than 1000k. */
function significant(value: number): number {
  if (value === 0) {
    return 0;
  }
  const factor = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 2);
  return Math.round(value / factor) * factor;
}

function decimal(value: number): string {
  const magnitude = Math.abs(value);
  const places = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  const text = value.toFixed(places);
  return places === 0 ? text : text.replace(/\.?0+$/, "");
}

/** How old a figure is, for the tooltip line that says the percentages are the account's. */
export function formatAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
