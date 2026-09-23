import type { Billing, BudgetReport, BudgetWindow, UsageBreakdown } from "@agnostic/core";
import type { BudgetConfig } from "./daemon-config.js";

/** Brief §5: the warning line is fixed, so there is no key for it and no per-window setting. */
export const WARN_AT = 0.8;

/**
 * What a window's ceiling and its priced spend say about each other. The comparison is against the
 * unrounded sum, so `$5.00` of `$5.00` is already exceeded and every client rounds for display.
 */
export function budgetWindow(limitUsd: number | null, spentUsd: number): BudgetWindow | null {
  if (limitUsd === null) {
    return null;
  }
  return { limitUsd, spentUsd, state: state(limitUsd, spentUsd) };
}

function state(limitUsd: number, spentUsd: number): BudgetWindow["state"] {
  if (spentUsd >= limitUsd) {
    return "exceeded";
  }
  return spentUsd >= WARN_AT * limitUsd ? "warn" : "ok";
}

/**
 * The api-key and credits spend of a window. The scanner prices a turn only when the task's
 * profile is billed by the token, so summing every priced row is exactly what the budget counts;
 * a row agn could not rule out (billing `unknown`) is priced like a key and counts here too.
 */
export function spentUsd(rows: UsageBreakdown[]): number {
  return rows.reduce((total, row) => total + (row.costUsd ?? 0), 0);
}

export function budgetReport(
  config: BudgetConfig,
  spent: { day: number; week: number },
): BudgetReport {
  return {
    day: budgetWindow(config.dailyUsd, spent.day),
    week: budgetWindow(config.weeklyUsd, spent.week),
  };
}

/** ADR 036 Q8: a subscription or local run is never counted and never refused. */
export function countsAgainstBudget(billing: Billing): boolean {
  return billing === "api-key" || billing === "credits";
}

/** The window a refusal names: the day first, because it is the tighter of the two. */
export function overBudget(
  report: BudgetReport,
): { window: "day" | "week"; budget: BudgetWindow } | null {
  if (report.day?.state === "exceeded") {
    return { window: "day", budget: report.day };
  }
  if (report.week?.state === "exceeded") {
    return { window: "week", budget: report.week };
  }
  return null;
}
