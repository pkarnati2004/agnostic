import type { BudgetReport, BudgetState, BudgetWindow, Profile } from "@agnostic/core";
import { budgetPercent, countsAgainstBudget } from "../usage/budget-line";
import { formatMoney } from "../usage/format-usage";

type BudgetNoteProps = {
  /** Null until the usage bar has a body to read the ceilings from. */
  budget: BudgetReport | null;
  /** The profile the task would run on; a subscription or local one is never counted. */
  profile: Profile | null;
  ignore: boolean;
  onIgnore: (ignore: boolean) => void;
};

const WHEN = { day: "today", week: "this week" } as const;

/**
 * What the budget means for the profile now selected, under the Profile select. A run at 100% is
 * refused by the daemon, so the checkbox here is this task's `--ignore-budget`, not a setting.
 */
export function BudgetNote({ budget, profile, ignore, onIgnore }: BudgetNoteProps) {
  if (budget === null || profile === null || !countsAgainstBudget(profile.billing)) {
    return null;
  }
  const over = windowsIn(budget, "exceeded");
  const warn = windowsIn(budget, "warn");
  if (over.length === 0 && warn.length === 0) {
    return null;
  }
  if (over.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--warning)" }}>
        {warn
          .map(([kind, window]) => `Budget: ${amounts(kind, window)} (${budgetPercent(window)}%).`)
          .join(" ")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-destructive text-xs">
        {over.map(([kind, window]) => `Over budget: ${amounts(kind, window)}.`).join(" ")} Run is
        refused for api-key and credits profiles.
      </p>
      <label className="flex items-center gap-2 text-muted-foreground text-xs">
        <input
          type="checkbox"
          checked={ignore}
          onChange={(change) => onIgnore(change.target.checked)}
        />
        Ignore the budget for this task
      </label>
    </div>
  );
}

function windowsIn(budget: BudgetReport, state: BudgetState): ["day" | "week", BudgetWindow][] {
  const set: ["day" | "week", BudgetWindow][] = [];
  if (budget.day?.state === state) {
    set.push(["day", budget.day]);
  }
  if (budget.week?.state === state) {
    set.push(["week", budget.week]);
  }
  return set;
}

function amounts(kind: "day" | "week", window: BudgetWindow): string {
  return `${WHEN[kind]} ${formatMoney(window.spentUsd)} of ${formatMoney(window.limitUsd)}`;
}
