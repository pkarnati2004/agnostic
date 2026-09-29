import type { Billing, BudgetWindow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { budgetLine, budgetPercent, budgetTone, countsAgainstBudget } from "./budget-line";

function window(spentUsd: number, limitUsd: number, state: BudgetWindow["state"]): BudgetWindow {
  return { spentUsd, limitUsd, state };
}

describe("budgetLine", () => {
  it("prints cents, and drops them when both figures are whole dollars", () => {
    expect(budgetLine(window(4.1, 5, "warn"), "today")).toBe("$4.10 / $5.00 today");
    expect(budgetLine(window(18, 20, "warn"), "wk")).toBe("$18 / $20 wk");
    expect(budgetLine(window(18.4, 20, "warn"), "wk")).toBe("$18.40 / $20.00 wk");
  });
});

describe("budgetPercent", () => {
  it("rounds to whole percent, past 100 as well", () => {
    expect(budgetPercent(window(4.1, 5, "warn"))).toBe(82);
    expect(budgetPercent(window(5.2, 5, "exceeded"))).toBe(104);
  });
});

describe("budgetTone", () => {
  it("takes the worse of the two windows", () => {
    const ok = window(1, 5, "ok");
    const warn = window(4, 5, "warn");
    const over = window(5, 5, "exceeded");
    expect(budgetTone({ day: null, week: null })).toBe("ok");
    expect(budgetTone({ day: ok, week: warn })).toBe("warn");
    expect(budgetTone({ day: warn, week: over })).toBe("exceeded");
    expect(budgetTone({ day: over, week: ok })).toBe("exceeded");
  });
});

describe("countsAgainstBudget", () => {
  // The same cases daemon/budget.test.ts pins, because the page restates the rule (ADR 036 Q8).
  it("counts what the user pays per token and nothing else", () => {
    const counted: Billing[] = ["api-key", "credits"];
    const free: Billing[] = ["subscription", "local", "unknown"];
    expect(counted.map(countsAgainstBudget)).toEqual([true, true]);
    expect(free.map(countsAgainstBudget)).toEqual([false, false, false]);
  });
});
