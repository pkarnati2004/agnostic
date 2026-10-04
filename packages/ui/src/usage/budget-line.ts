import type { Billing, BudgetReport, BudgetState, BudgetWindow } from "@agnostic/core";

const WORSE: Record<BudgetState, number> = { ok: 0, warn: 1, exceeded: 2 };

/** `today $4.10 of $5`: cents only where a figure has them, because the cell is one line of 28 px. */
export function budgetLine(window: BudgetWindow, when: "today" | "week"): string {
  return `${when} ${money(window.spentUsd)} of ${money(window.limitUsd)}`;
}

/** What the cell says about the worse window; ok says nothing, because the figures already do. */
export function budgetNotice(state: BudgetState): string | null {
  switch (state) {
    case "ok":
      return null;
    case "warn":
      return "Past your 80% budget";
    case "exceeded":
      return "Over budget";
  }
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

function money(usd: number): string {
  return `$${Number.isInteger(usd) ? usd.toFixed(0) : usd.toFixed(2)}`;
}
