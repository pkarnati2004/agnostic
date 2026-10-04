import type { Billing, BudgetWindow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import {
  budgetLine,
  budgetNotice,
  budgetPercent,
  budgetTone,
  countsAgainstBudget,
} from "./budget-line";

function window(spentUsd: number, limitUsd: number, state: BudgetWindow["state"]): BudgetWindow {
  return { spentUsd, limitUsd, state };
}

describe("budgetLine", () => {
  it("names the window, then the spend against the ceiling", () => {
    expect(budgetLine(window(4.1, 5, "warn"), "today")).toBe("today $4.10 of $5");
    expect(budgetLine(window(16.4, 20, "warn"), "week")).toBe("week $16.40 of $20");
  });

  it("prints cents only where a figure has them", () => {
    expect(budgetLine(window(18, 20, "warn"), "week")).toBe("week $18 of $20");
    expect(budgetLine(window(4.1, 5.5, "warn"), "today")).toBe("today $4.10 of $5.50");
  });
});

describe("budgetNotice", () => {
  it("says what the tone means, and says nothing while the spend is fine", () => {
    expect(budgetNotice("ok")).toBe(null);
    expect(budgetNotice("warn")).toBe("Past your 80% budget");
    expect(budgetNotice("exceeded")).toBe("Over budget");
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
