import type { Catalog, ModelRow, PricingRow } from "@agnostic/catalog";
import { describe, expect, it } from "vitest";
import { costForTurn, priceTokens, pricingRow } from "./pricing.js";
import type { TranscriptTurn } from "./transcript-parser.js";

const opus: PricingRow = {
  model: "anthropic/claude-opus-4.8",
  inputPerMillion: 3,
  outputPerMillion: 15,
  cacheReadPerMillion: 0.3,
  cacheWritePerMillion: 3.75,
  source: "openrouter",
  asOf: "2026-09-01",
};

const noCacheRates: PricingRow = {
  ...opus,
  model: "openai/gpt-6-astra",
  cacheReadPerMillion: null,
  cacheWritePerMillion: null,
};

const models: ModelRow[] = [
  {
    harness: "claude-code",
    model: "opus",
    route: "native",
    canonical: "anthropic/claude-opus-4.8",
    legacy: false,
  },
  { harness: "claude-code", model: "house", route: "native", canonical: null, legacy: false },
];

const pricing = [opus, noCacheRates];

function turn(overrides: Partial<TranscriptTurn> = {}): TranscriptTurn {
  return {
    harness: "claude-code",
    sessionId: "s-aaaa",
    cwd: "/Users/me/code/petal",
    ts: "2026-09-11T14:00:00.000Z",
    model: "claude-opus-4-8-20260501",
    tokensInput: 1_000_000,
    tokensOutput: 1_000_000,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    costUsd: null,
    ref: "claude-code:msg_a:req_a",
    ...overrides,
  };
}

describe("pricingRow", () => {
  it("joins through the catalog's canonical id", () => {
    expect(pricingRow("claude-code", "opus", models, pricing)).toBe(opus);
  });

  it("matches a dated release against its undated row", () => {
    expect(pricingRow("claude-code", "claude-opus-4-8-20260501", models, pricing)).toBe(opus);
  });

  it("matches whatever the vendor prefix and the dots say", () => {
    expect(pricingRow("claude-code", "Claude-Opus-4.8", models, pricing)).toBe(opus);
  });

  it("has no row for a model nobody publishes a price for", () => {
    expect(pricingRow("claude-code", "claude-mystery-9", models, pricing)).toBeNull();
  });

  it("falls through to the name when the catalog row has no canonical id", () => {
    expect(pricingRow("claude-code", "house", models, pricing)).toBeNull();
  });
});

describe("priceTokens", () => {
  it("charges each bucket at its own rate", () => {
    const cost = priceTokens(
      { input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 },
      opus,
    );

    expect(cost).toBe(18);
  });

  it("rounds to the millionth of a dollar", () => {
    expect(priceTokens({ input: 1, output: 0, cacheRead: null, cacheWrite: null }, opus)).toBe(
      0.000003,
    );
  });

  it("cannot price cache tokens that have no rate", () => {
    const cost = priceTokens(
      { input: 100, output: 100, cacheRead: 5_000, cacheWrite: 0 },
      noCacheRates,
    );

    expect(cost).toBeNull();
  });

  it("prices a turn that used no cache against a row with no cache rate", () => {
    const cost = priceTokens(
      { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: null },
      noCacheRates,
    );

    expect(cost).toBe(3);
  });
});

describe("costForTurn", () => {
  const catalog = { models, pricing } as Catalog;

  it("prices an api key, credits and a billing agn could not name", () => {
    expect(costForTurn(turn(), "api-key", catalog)).toBe(18);
    expect(costForTurn(turn(), "credits", catalog)).toBe(18);
    expect(costForTurn(turn(), "unknown", catalog)).toBe(18);
  });

  it("takes the cost the harness reported over its own estimate", () => {
    expect(costForTurn(turn({ costUsd: 0.42 }), "api-key", catalog)).toBe(0.42);
    // A model the catalog has no row for still has the cost the harness wrote for it.
    expect(costForTurn(turn({ model: null, costUsd: 0.42 }), "api-key", catalog)).toBe(0.42);
  });

  it("charges nothing for a subscription, whatever cost the harness reported", () => {
    expect(costForTurn(turn({ costUsd: 0.42 }), "subscription", catalog)).toBeNull();
  });

  it("charges nothing for a subscription or a local model", () => {
    expect(costForTurn(turn(), "subscription", catalog)).toBeNull();
    expect(costForTurn(turn(), "local", catalog)).toBeNull();
  });

  it("says nothing about a turn whose billing is unknown", () => {
    expect(costForTurn(turn(), null, catalog)).toBeNull();
  });

  it("says nothing about a model with no price, rather than saying it was free", () => {
    expect(costForTurn(turn({ model: "claude-mystery-9" }), "api-key", catalog)).toBeNull();
    expect(costForTurn(turn({ model: null }), "api-key", catalog)).toBeNull();
  });
});
