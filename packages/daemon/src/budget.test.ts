import type { Billing, UsageBreakdown } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import {
  budgetReport,
  budgetWindow,
  countsAgainstBudget,
  overBudget,
  spentUsd,
  WARN_AT,
} from "./budget.js";

function row(costUsd: number | null): UsageBreakdown {
  return {
    harness: "claude-code",
    model: "claude-fable-5-1",
    attributed: true,
    tokens: 1_000,
    tokensInput: 1_000,
    tokensOutput: null,
    tokensCacheRead: null,
    tokensCacheWrite: null,
    costUsd,
  };
}

describe("budgetWindow", () => {
  it("has nothing to say about a window with no ceiling", () => {
    expect(budgetWindow(null, 12)).toBeNull();
  });

  it("warns from 80% of the ceiling and refuses from 100%", () => {
    expect(budgetWindow(5, 0)?.state).toBe("ok");
    expect(budgetWindow(5, 3.99)?.state).toBe("ok");
    expect(budgetWindow(5, WARN_AT * 5)?.state).toBe("warn");
    expect(budgetWindow(5, 4.99)?.state).toBe("warn");
    expect(budgetWindow(5, 5)?.state).toBe("exceeded");
    expect(budgetWindow(5, 6)?.state).toBe("exceeded");
  });

  it("carries both figures as they were summed, for the clients to round", () => {
    expect(budgetWindow(5, 4.123456)).toEqual({
      limitUsd: 5,
      spentUsd: 4.123456,
      state: "warn",
    });
  });
});

describe("spentUsd", () => {
  it("sums what was priced and counts an unpriced row as nothing", () => {
    expect(spentUsd([row(1.5), row(null), row(0.25)])).toBeCloseTo(1.75, 6);
    expect(spentUsd([])).toBe(0);
  });
});

describe("budgetReport", () => {
  it("reports only the windows config.yaml sets a ceiling for", () => {
    expect(budgetReport({ dailyUsd: 5, weeklyUsd: null }, { day: 4, week: 9 })).toEqual({
      day: { limitUsd: 5, spentUsd: 4, state: "warn" },
      week: null,
    });
    expect(budgetReport({ dailyUsd: null, weeklyUsd: null }, { day: 4, week: 9 })).toEqual({
      day: null,
      week: null,
    });
    expect(budgetReport({ dailyUsd: 5, weeklyUsd: 20 }, { day: 1, week: 21 })).toEqual({
      day: { limitUsd: 5, spentUsd: 1, state: "ok" },
      week: { limitUsd: 20, spentUsd: 21, state: "exceeded" },
    });
  });
});

describe("countsAgainstBudget", () => {
  it("counts what the user pays per token and nothing else", () => {
    const counted: Billing[] = ["api-key", "credits"];
    const free: Billing[] = ["subscription", "local", "unknown"];
    expect(counted.map(countsAgainstBudget)).toEqual([true, true]);
    expect(free.map(countsAgainstBudget)).toEqual([false, false, false]);
  });
});

describe("overBudget", () => {
  it("names the day before the week, and nothing when neither is spent", () => {
    const day = { limitUsd: 5, spentUsd: 5, state: "exceeded" as const };
    const week = { limitUsd: 20, spentUsd: 20, state: "exceeded" as const };
    expect(overBudget({ day, week })).toEqual({ window: "day", budget: day });
    expect(overBudget({ day: null, week })).toEqual({ window: "week", budget: week });
    expect(overBudget({ day: { ...day, spentUsd: 1, state: "ok" }, week: null })).toBeNull();
    expect(overBudget({ day: null, week: null })).toBeNull();
  });
});
