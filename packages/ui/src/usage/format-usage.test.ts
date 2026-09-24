import { describe, expect, it } from "vitest";
import {
  formatAgo,
  formatCount,
  formatMoney,
  formatPercent,
  formatReset,
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

describe("formatPercent", () => {
  it("rounds a 0..100 figure to whole percent", () => {
    expect(formatPercent(58)).toBe("58%");
    expect(formatPercent(0.4)).toBe("0%");
    expect(formatPercent(99.6)).toBe("100%");
  });
});

describe("formatReset", () => {
  const now = new Date("2026-09-11T13:00:00").getTime();

  it("gives the clock time alone while the reset is today", () => {
    expect(formatReset(new Date("2026-09-11T14:05:00").toISOString(), now)).toBe("14:05");
  });

  it("names the weekday once the reset is another day", () => {
    expect(formatReset(new Date("2026-09-14T09:00:00").toISOString(), now)).toBe("Mon 09:00");
  });
});

describe("formatAgo", () => {
  const now = new Date("2026-09-11T13:00:00").getTime();
  const ago = (minutes: number) => formatAgo(new Date(now - minutes * 60_000).toISOString(), now);

  it("counts minutes, then hours, then days", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(3)).toBe("3 min ago");
    expect(ago(90)).toBe("1 h ago");
    expect(ago(60 * 30)).toBe("1 d ago");
  });
});
