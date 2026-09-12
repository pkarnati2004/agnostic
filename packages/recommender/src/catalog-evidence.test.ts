import { type Catalog, emptyCatalog } from "@agnostic/catalog";
import { beforeAll, describe, expect, it } from "vitest";
import { catalogEvidence } from "./catalog-evidence.js";
import { fixtureCatalog, NOW, testProfile } from "./test-catalog.js";

let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

const opus = testProfile({});
const codex = testProfile({ harness: "codex", model: "gpt-5.6-sol" });
const fable = testProfile({ model: "fable" });

describe("catalogEvidence", () => {
  it("calls a row for this harness, model and class strong, and names its sources", () => {
    const evidence = catalogEvidence(catalog, opus, "debug", NOW);
    expect(evidence.level).toBe("strong");
    expect(evidence.sources).toEqual(["swe-bench-verified", "terminal-bench"]);
    expect(evidence.classes).toEqual(["debug"]);
  });

  it("scores each row against the best result on that benchmark and class", () => {
    // 74 of the best 96 on SWE-bench Verified, and 60 of the best 60 on Terminal-Bench.
    expect(catalogEvidence(catalog, opus, "debug", NOW).score).toBeCloseTo((74 / 96 + 1) / 2, 10);
  });

  it("calls a row for another class some, and weighs a general benchmark fully", () => {
    const evidence = catalogEvidence(catalog, codex, "debug", NOW);
    expect(evidence.level).toBe("some");
    expect(evidence.classes).toEqual(["general"]);
    // 66 of the best 80 on that benchmark, at the 0.8 the level is worth.
    expect(evidence.score).toBeCloseTo((66 / 80) * 0.8, 10);
  });

  it("falls back to a row that names no harness, and says so", () => {
    const evidence = catalogEvidence(catalog, fable, "debug", NOW);
    expect(evidence.level).toBe("model-level");
    expect(evidence.score).toBeCloseTo((48 / 60) * 0.6, 10);
  });

  it("has nothing for a model nobody measured, or for a harness's own default model", () => {
    const unmeasured = catalogEvidence(catalog, testProfile({ model: "opus-6" }), "debug", NOW);
    expect(unmeasured).toEqual({ level: "none", score: 0, sources: [], classes: [] });
    const dflt = catalogEvidence(catalog, testProfile({ model: null }), "debug", NOW);
    expect(dflt.level).toBe("none");
    expect(catalogEvidence(emptyCatalog(), opus, "debug", NOW).level).toBe("none");
  });

  it("ignores a row more than 360 days old", () => {
    // Codex's only debug row is from 2024; without it the general row is all that is left.
    expect(catalogEvidence(catalog, codex, "debug", NOW).level).toBe("some");
    const whenItWasFresh = catalogEvidence(catalog, codex, "debug", new Date("2024-02-01"));
    expect(whenItWasFresh.level).toBe("strong");
  });

  it("weighs a row from another class at half when it is all there is", () => {
    const evidence = catalogEvidence(catalog, opus, "implement", NOW);
    expect(evidence.level).toBe("some");
    expect(evidence.score).toBeCloseTo(((74 / 96 + 1) / 2) * 0.8, 10);
  });
});
