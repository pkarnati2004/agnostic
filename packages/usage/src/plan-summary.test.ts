import type { HarnessId, PlanVendor, UsageBreakdown } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { summarizePlans } from "./plan-summary.js";

function line(overrides: Partial<UsageBreakdown> = {}): UsageBreakdown {
  return {
    harness: "claude-code",
    model: "claude-sonnet-5",
    attributed: true,
    tokens: 100,
    tokensInput: 60,
    tokensOutput: 40,
    tokensCacheRead: null,
    tokensCacheWrite: null,
    costUsd: null,
    ...overrides,
  };
}

const vendorOf = (harness: HarnessId): PlanVendor | null => {
  if (harness === "claude-code") {
    return "claude";
  }
  return harness === "codex" ? "chatgpt" : null;
};

const plans = { claude: "max20", chatgpt: "plus" };

describe("summarizePlans", () => {
  it("gives each harness one row, labelled with the plan it is billed on", () => {
    const rows = summarizePlans([line(), line({ harness: "codex" })], plans, vendorOf);

    expect(rows.map((row) => [row.harness, row.vendor, row.plan])).toEqual([
      ["claude-code", "claude", "max20"],
      ["codex", "chatgpt", "plus"],
    ]);
  });

  it("adds the models up and keeps a bucket null when no row reported it", () => {
    const rows = summarizePlans(
      [line({ tokensCacheRead: 500 }), line({ model: "claude-fable-5-1", costUsd: 0.25 })],
      plans,
      vendorOf,
    );

    expect(rows[0]?.usage).toEqual({
      tokens: 200,
      tokensInput: 120,
      tokensOutput: 80,
      tokensCacheRead: 500,
      tokensCacheWrite: null,
      costUsd: 0.25,
    });
  });

  it("counts what agn did not start separately from the total", () => {
    const rows = summarizePlans([line(), line({ attributed: false, tokens: 40 })], plans, vendorOf);

    expect(rows[0]).toMatchObject({ unattributedTokens: 40, usage: { tokens: 140 } });
  });

  it("has no plan for a harness billed per provider key", () => {
    const rows = summarizePlans([line({ harness: "pi" })], plans, vendorOf);

    expect(rows[0]).toMatchObject({ vendor: null, plan: null, fableShare: null });
  });

  it("reports no plan when nothing said which one", () => {
    const rows = summarizePlans([line()], {}, vendorOf);

    expect(rows[0]?.plan).toBeNull();
  });

  it("reports the share of Claude tokens that went to a Fable model", () => {
    const rows = summarizePlans(
      [
        line({ model: "claude-fable-5-1" }),
        line({ model: "claude-sonnet-5" }),
        line({ model: "claude-sonnet-5", attributed: false }),
        line({ model: "claude-haiku-4-5" }),
      ],
      plans,
      vendorOf,
    );

    expect(rows[0]?.fableShare).toBe(0.25);
  });

  it("has no Fable share for another vendor, or for a row with no tokens", () => {
    const rows = summarizePlans(
      [line({ harness: "codex", model: "gpt-6-astra" }), line({ tokens: 0 })],
      plans,
      vendorOf,
    );

    expect(rows.map((row) => [row.harness, row.fableShare])).toEqual([
      ["codex", null],
      ["claude-code", null],
    ]);
  });
});
