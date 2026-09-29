import type { Billing, BudgetReport, BudgetState, BudgetWindow } from "@agnostic/core";

const WORSE: Record<BudgetState, number> = { ok: 0, warn: 1, exceeded: 2 };

/** `$4.10 / $5.00 today`, or `$18 / $20 wk` when both figures are whole: the cell stays short. */
export function budgetLine(window: BudgetWindow, when: "today" | "wk"): string {
  const whole = Number.isInteger(window.spentUsd) && Number.isInteger(window.limitUsd);
  return `${money(window.spentUsd, whole)} / ${money(window.limitUsd, whole)} ${when}`;
}

export function budgetPercent(window: BudgetWindow): number {
  return Math.round((window.spentUsd / window.limitUsd) * 100);
}

/** The bar has one colour, so a report with two windows takes the worse of them. */
export function budgetTone(report: BudgetReport): BudgetState {
  const states = [report.day?.state, report.week?.state].filter(
    (state): state is BudgetState => state !== undefined,
  );
  return states.reduce<BudgetState>(
    (worst, state) => (WORSE[state] > WORSE[worst] ? state : worst),
    "ok",
  );
}

// The page cannot import the daemon's own rule - that package is not in this bundle - so the two
// billings ADR 036 Q8 counts are restated here and budget-line.test.ts pins them to the same cases.
export function countsAgainstBudget(billing: Billing): boolean {
  return billing === "api-key" || billing === "credits";
}

function money(usd: number, whole: boolean): string {
  return `$${whole ? usd.toFixed(0) : usd.toFixed(2)}`;
}
