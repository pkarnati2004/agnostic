import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { type Catalog, parseCatalog } from "./catalog-schema.js";
import { bundledCatalogPath } from "./load-catalog.js";

const catalog: Catalog = parseCatalog(JSON.parse(await readFile(bundledCatalogPath(), "utf8")));

const duplicates = (keys: string[]): string[] =>
  keys.filter((key, index) => keys.indexOf(key) !== index);

describe("the catalog agn ships", () => {
  it("parses, and every table has rows", () => {
    expect(catalog.schemaVersion).toBe(1);
    for (const [table, rows] of Object.entries({
      sources: catalog.sources,
      benchmarks: catalog.benchmarks,
      models: catalog.models,
      plans: catalog.plans,
      entitlements: catalog.entitlements,
      pricing: catalog.pricing,
    })) {
      expect(rows.length, table).toBeGreaterThan(0);
    }
  });

  it("names each harness, model and route once, and each entitlement once", () => {
    expect(
      duplicates(catalog.models.map((row) => `${row.harness}/${row.model}/${row.route}`)),
    ).toEqual([]);
    expect(
      duplicates(
        catalog.entitlements.map((row) => `${row.harness}/${row.model}/${row.vendor}/${row.plan}`),
      ),
    ).toEqual([]);
    expect(duplicates(catalog.pricing.map((row) => row.model))).toEqual([]);
    expect(duplicates(catalog.sources.map((row) => row.id))).toEqual([]);
  });

  it("entitles only models it also lists, and prices only canonical ids", () => {
    const models = new Set(catalog.models.map((row) => `${row.harness}/${row.model}`));
    for (const row of catalog.entitlements) {
      expect(models, `${row.harness}/${row.model}`).toContain(`${row.harness}/${row.model}`);
    }
    const canonical = new Set(
      catalog.models.flatMap((row) => (row.canonical === null ? [] : [row.canonical])),
    );
    for (const row of catalog.pricing) {
      expect(canonical, row.model).toContain(row.model);
    }
    for (const id of canonical) {
      expect(
        catalog.pricing.map((row) => row.model),
        id,
      ).toContain(id);
    }
  });

  it("carries a harness row for every tier-1 harness that runs a subscription model", () => {
    const harnesses = new Set(catalog.benchmarks.map((row) => row.harness));
    for (const harness of ["claude-code", "codex", "opencode", "pi"]) {
      expect(harnesses, harness).toContain(harness);
    }
  });

  it("dates no row after the day it was generated", () => {
    const generated = catalog.generatedAt.slice(0, 10);
    for (const row of catalog.benchmarks) {
      expect(
        row.date.localeCompare(generated),
        `${row.benchmark} ${row.model}`,
      ).toBeLessThanOrEqual(0);
    }
    for (const source of catalog.sources) {
      expect(source.fetchedAt.localeCompare(generated), source.id).toBeLessThanOrEqual(0);
    }
  });

  it("keeps the transcription honest: 20 to 60 benchmark rows, each with a source", () => {
    expect(catalog.benchmarks.length).toBeGreaterThanOrEqual(20);
    expect(catalog.benchmarks.length).toBeLessThanOrEqual(60);
    const sources = new Set(catalog.sources.map((row) => row.id));
    for (const row of catalog.benchmarks) {
      expect(sources, row.source).toContain(row.source);
    }
  });
});
