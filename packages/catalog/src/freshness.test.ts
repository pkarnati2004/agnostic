import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCatalog } from "./catalog-schema.js";
import { freshBenchmarks, freshness } from "./freshness.js";
import { testVendorOf } from "./test-vendors.js";

const NOW = new Date("2026-09-11T00:00:00Z");

/** A date exactly `days` before NOW, so each case says what age it is testing. */
function aged(days: number): string {
  const date = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

describe("freshness", () => {
  it("keeps full weight through day 180 and none from day 360", () => {
    expect(freshness(aged(0), NOW)).toBe(1);
    expect(freshness(aged(180), NOW)).toBe(1);
    expect(freshness(aged(360), NOW)).toBe(0);
    expect(freshness(aged(500), NOW)).toBe(0);
  });

  it("fades linearly in between", () => {
    expect(freshness(aged(270), NOW)).toBeCloseTo(0.5, 2);
  });

  it("does not discount a row dated in the future", () => {
    expect(freshness(aged(-30), NOW)).toBe(1);
  });

  it("drops the rows that have decayed away and weights the rest", async () => {
    const file = fileURLToPath(
      new URL("../../../tests/fixtures/catalog/stale.json", import.meta.url),
    );
    const catalog = parseCatalog(JSON.parse(await readFile(file, "utf8")), {
      vendorOf: testVendorOf,
    });
    const fresh = freshBenchmarks(catalog, NOW);
    expect(fresh).toHaveLength(2);
    expect(fresh[0]?.weight).toBe(1);
    expect(fresh[1]?.weight).toBeCloseTo(0.59, 2);
  });
});
