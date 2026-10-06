import type { Billing, PlanPresent, PlanVendor } from "@agnostic/core";

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

/** The cell is 28 px of one line: `2.1M`, `184k`, `640`. The tooltip keeps formatCount's figure. */
export function formatCompact(tokens: number | null): string {
  if (tokens === null) {
    return "-";
  }
  if (tokens >= 1_000_000) {
    return `${oneDecimal(tokens / 1_000_000)}M`;
  }
  return tokens >= 1_000 ? `${oneDecimal(tokens / 1_000)}k` : String(tokens);
}

/** What the vendor calls itself, which is not what agn calls the harness it bills for. */
export const VENDOR_NAME: Record<PlanVendor, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  google: "Gemini",
  xai: "Grok",
  moonshot: "Kimi",
  cursor: "Cursor",
};

/**
 * `Claude max20`, the vendor alone while its plan is still unknown, and the harness id where no
 * vendor bills it. The plan is the id agn stores, not the catalog's display name: the display names
 * arrive with `planOptions`, which the bar reads only to ask the question.
 */
export function planLabel(row: PlanPresent): string {
  if (row.vendor === null) {
    return row.harness;
  }
  const vendor = VENDOR_NAME[row.vendor];
  return row.plan === null ? vendor : `${vendor} ${row.plan}`;
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

function oneDecimal(value: number): string {
  const figure = value.toFixed(1);
  return figure.endsWith(".0") ? figure.slice(0, -2) : figure;
}
