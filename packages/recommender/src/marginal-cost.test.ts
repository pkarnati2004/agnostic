import type { Catalog } from "@agnostic/catalog";
import { beforeAll, describe, expect, it } from "vitest";
import { marginalCostUsd } from "./marginal-cost.js";
import { fixtureCatalog, testProfile } from "./test-catalog.js";

let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

// 150k tokens at 0.9 × $10/M input and 0.1 × $50/M output.
const OPUS_SMALL = 150_000 * ((0.9 * 10 + 0.1 * 50) / 1_000_000);

describe("marginalCostUsd", () => {
  it("charges nothing extra for a plan the user already pays for, or for their own machine", () => {
    expect(marginalCostUsd(catalog, testProfile({}), "small")).toBeNull();
    const local = testProfile({ harness: "opencode", route: "local", billing: "local" });
    expect(marginalCostUsd(catalog, local, "large")).toBeNull();
  });

  it("prices an API key by the blended rate and the scope", () => {
    const apiKey = testProfile({ billing: "api-key" });
    expect(marginalCostUsd(catalog, apiKey, "small")).toBeCloseTo(OPUS_SMALL, 10);
    expect(marginalCostUsd(catalog, apiKey, "large")).toBeCloseTo((OPUS_SMALL / 150_000) * 1e6, 10);
  });

  it("prices credits and unknown billing exactly like an API key (ADR 016)", () => {
    const credits = testProfile({ billing: "credits" });
    const unknown = testProfile({ billing: "unknown" });
    expect(marginalCostUsd(catalog, credits, "small")).toBeCloseTo(OPUS_SMALL, 10);
    expect(marginalCostUsd(catalog, unknown, "small")).toBeCloseTo(OPUS_SMALL, 10);
  });

  it("charges an unpriced model the dearest rate in the table", () => {
    const unpriced = testProfile({ model: "opus-6", billing: "api-key" });
    expect(marginalCostUsd(catalog, unpriced, "small")).toBeCloseTo(OPUS_SMALL, 10);
    const dflt = testProfile({ model: null, billing: "api-key" });
    expect(marginalCostUsd(catalog, dflt, "small")).toBeCloseTo(OPUS_SMALL, 10);
  });
});
