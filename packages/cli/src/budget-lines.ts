import type { BudgetReport, BudgetState, BudgetWindow } from "@agnostic/core";

const WHEN = { day: "today", week: "this week" } as const;

const WORD: Record<BudgetState, string> = { ok: "ok", warn: "warn", exceeded: "over" };

/** What `agn run` prints before it starts: one line per window the machine is near or past. */
export function budgetWarnings(budget: BudgetReport): string[] {
  return windows(budget)
    .filter(([, window]) => window.state !== "ok")
    .map(([kind, window]) => `budget: ${amounts(kind, window)} (${percent(window)}%)`);
}

/** What `agn usage` prints under the tables: every window that has a ceiling, state and all. */
export function budgetSummary(budget: BudgetReport): string[] {
  return windows(budget).map(
    ([kind, window]) =>
      `budget ${amounts(kind, window)} (${percent(window)}%, ${WORD[window.state]})`,
  );
}

function windows(budget: BudgetReport): ["day" | "week", BudgetWindow][] {
  const set: ["day" | "week", BudgetWindow][] = [];
  if (budget.day !== null) {
    set.push(["day", budget.day]);
  }
  if (budget.week !== null) {
    set.push(["week", budget.week]);
  }
  return set;
}

function amounts(kind: "day" | "week", window: BudgetWindow): string {
  return `${WHEN[kind]} $${window.spentUsd.toFixed(2)} of $${window.limitUsd.toFixed(2)}`;
}

function percent(window: BudgetWindow): number {
  return Math.round((window.spentUsd / window.limitUsd) * 100);
}
