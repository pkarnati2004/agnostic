import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatMoney,
  formatShare,
  formatTaskCost,
  planLabel,
  windowHeading,
} from "./format-usage";
import {
  claudePlan,
  meteredTaskUsage,
  subscriptionTaskUsage,
  usageResponse,
} from "./usage-response.fixture";

// The cases are `agn usage`'s own (packages/cli/src/commands/usage.test.ts): the bar and the table
// print the same figures, so a change to one of them fails here.
describe("formatCount", () => {
  it("groups thousands by hand, wherever the page runs", () => {
    expect(formatCount(1_234_567)).toBe("1,234,567");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(0)).toBe("0");
  });

  it("shows a bucket nothing reported as a dash, not a zero", () => {
    expect(formatCount(null)).toBe("-");
  });
});

describe("formatMoney", () => {
  it("rounds to cents", () => {
    expect(formatMoney(1.234)).toBe("$1.23");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(null)).toBe("-");
  });
});

describe("formatShare", () => {
  it("rounds a 0..1 share to whole percent", () => {
    expect(formatShare(0.415)).toBe("42%");
    expect(formatShare(null)).toBe("-");
  });
});

describe("planLabel", () => {
  it("names the vendor and the plan", () => {
    expect(planLabel(claudePlan())).toBe("claude max20");
  });

  it("falls back to the plan alone when no vendor owns it", () => {
    expect(planLabel(claudePlan({ vendor: null, plan: "x" }))).toBe("x");
  });

  it("says a plan agn does not know", () => {
    expect(planLabel(claudePlan({ plan: null }))).toBe("unknown plan");
  });
});

describe("formatTaskCost", () => {
  it("says a subscription covered the run rather than printing a dash", () => {
    expect(formatTaskCost(null, "subscription")).toBe("included in plan");
    expect(formatTaskCost(null, "local")).toBe("included in plan");
  });

  it("prints a dash for a metered run nothing priced", () => {
    expect(formatTaskCost(null, "api-key")).toBe("-");
    expect(formatTaskCost(null, null)).toBe("-");
  });

  it("prints the price when there is one", () => {
    expect(formatTaskCost(1.5, "subscription")).toBe("$1.50");
  });

  it("reads a task usage body the way the header does", () => {
    const { usage, billing } = subscriptionTaskUsage;
    expect(formatTaskCost(usage.costUsd, billing)).toBe("included in plan");
    expect(formatTaskCost(meteredTaskUsage.usage.costUsd, meteredTaskUsage.billing)).toBe("$1.50");
  });
});

describe("windowHeading", () => {
  it("heads the day with the date the daemon computed it in", () => {
    expect(windowHeading(usageResponse().day.window)).toBe("2026-09-11");
  });

  it("heads the week with the weekday it starts on", () => {
    expect(windowHeading(usageResponse().week.window)).toBe("from Mon 2026-09-07");
  });
});
