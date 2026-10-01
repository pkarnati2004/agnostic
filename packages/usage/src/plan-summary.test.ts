import type { ModelRow, PricingRow } from "@agnostic/catalog";
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

const sonnet: PricingRow = {
  model: "anthropic/claude-sonnet-5",
  inputPerMillion: 3,
  outputPerMillion: 15,
  cacheReadPerMillion: 0.3,
  cacheWritePerMillion: 3.75,
  source: "openrouter",
  asOf: "2026-09-01",
};

const models: ModelRow[] = [
  {
    harness: "claude-code",
    model: "claude-sonnet-5",
    route: "native",
    canonical: "anthropic/claude-sonnet-5",
    legacy: false,
  },
];

const rates = { models, pricing: [sonnet] };

describe("summarizePlans", () => {
  it("gives each harness one row, labelled with the plan it is billed on", () => {
    const rows = summarizePlans([line(), line({ harness: "codex" })], plans, vendorOf, rates);

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
      rates,
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
    const rows = summarizePlans(
      [line(), line({ attributed: false, tokens: 40 })],
      plans,
      vendorOf,
      rates,
    );

    expect(rows[0]).toMatchObject({ unattributedTokens: 40, usage: { tokens: 140 } });
  });

  it("has no plan for a harness billed per provider key", () => {
    const rows = summarizePlans([line({ harness: "pi" })], plans, vendorOf, rates);

    expect(rows[0]).toMatchObject({ vendor: null, plan: null, fableShare: null });
  });

  it("reports no plan when nothing said which one", () => {
    const rows = summarizePlans([line()], {}, vendorOf, rates);

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
      rates,
    );

    expect(rows[0]?.fableShare).toBe(0.25);
  });

  it("has no Fable share for another vendor, or for a row with no tokens", () => {
    const rows = summarizePlans(
      [line({ harness: "codex", model: "gpt-6-astra" }), line({ tokens: 0 })],
      plans,
      vendorOf,
      rates,
    );

    expect(rows.map((row) => [row.harness, row.fableShare])).toEqual([
      ["codex", null],
      ["claude-code", null],
    ]);
  });
});

describe("summarizePlans and the API-rate figure", () => {
  it("prices a subscription plan's tokens at the catalog's rates, every row included", () => {
    const rows = summarizePlans(
      [
        line({ tokensInput: 1_000_000, tokensOutput: 1_000_000 }),
        line({ attributed: false, tokensInput: 1_000_000, tokensOutput: 0 }),
      ],
      plans,
      vendorOf,
      rates,
    );

    expect(rows[0]?.apiRateUsd).toBe(21);
  });

  it("will not price a group when one model has no row", () => {
    const rows = summarizePlans(
      [line(), line({ model: "claude-mystery-9" })],
      plans,
      vendorOf,
      rates,
    );

    expect(rows[0]?.apiRateUsd).toBeNull();
  });

  it("leaves a metered plan to its real cost", () => {
    const rows = summarizePlans([line({ costUsd: 0.25 })], plans, vendorOf, rates);

    expect(rows[0]?.apiRateUsd).toBeNull();
  });

  it("has no figure for a harness billed per provider key", () => {
    const rows = summarizePlans([line({ harness: "pi" })], plans, vendorOf, rates);

    expect(rows[0]?.apiRateUsd).toBeNull();
  });

  it("skips a row with no tokens rather than refusing to price the group", () => {
    const rows = summarizePlans(
      [line({ tokensInput: 1_000_000, tokensOutput: 0 }), line({ model: null, tokens: 0 })],
      plans,
      vendorOf,
      rates,
    );

    expect(rows[0]?.apiRateUsd).toBe(3);
  });
});
