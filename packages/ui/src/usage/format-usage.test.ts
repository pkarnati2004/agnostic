import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatCount,
  formatMoney,
  formatPercent,
  formatShare,
  formatTaskCost,
  planLabel,
} from "./format-usage";
import { claudePlan, meteredTaskUsage, subscriptionTaskUsage } from "./usage-response.fixture";

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

describe("formatCompact", () => {
  it("shortens the figure to what fits one cell", () => {
    expect(formatCompact(2_100_000)).toBe("2.1M");
    expect(formatCompact(184_000)).toBe("184k");
    expect(formatCompact(640)).toBe("640");
    expect(formatCompact(null)).toBe("-");
  });

  it("drops a trailing zero rather than printing one", () => {
    expect(formatCompact(2_000_000)).toBe("2M");
    expect(formatCompact(1_234_567)).toBe("1.2M");
  });

  it("switches units right at each threshold, not one figure early or late", () => {
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(1_000)).toBe("1k");
    expect(formatCompact(1_050_000)).toBe("1.1M");
  });
});

describe("planLabel", () => {
  it("names the vendor as the vendor names itself, then the plan agn stores", () => {
    expect(planLabel(claudePlan())).toBe("Claude max20");
    expect(planLabel(claudePlan({ vendor: "chatgpt", plan: "plus" }))).toBe("ChatGPT plus");
  });

  it("names the vendor alone while its plan is unknown", () => {
    expect(planLabel(claudePlan({ plan: null }))).toBe("Claude");
  });

  it("names the harness where no vendor bills it", () => {
    expect(planLabel(claudePlan({ harness: "opencode", vendor: null, plan: null }))).toBe(
      "opencode",
    );
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

describe("formatPercent", () => {
  it("rounds a 0..100 figure to whole percent", () => {
    expect(formatPercent(58)).toBe("58%");
    expect(formatPercent(0.4)).toBe("0%");
    expect(formatPercent(99.6)).toBe("100%");
  });
});
