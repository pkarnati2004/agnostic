import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { entitlement, knowsPlan, modelRows, plansForVendor } from "./catalog-queries.js";
import { type Catalog, parseCatalog } from "./catalog-schema.js";

let catalog: Catalog;

beforeAll(async () => {
  const file = fileURLToPath(
    new URL("../../../tests/fixtures/catalog/complete.json", import.meta.url),
  );
  catalog = parseCatalog(JSON.parse(await readFile(file, "utf8")));
});

describe("modelRows", () => {
  it("filters by harness and route, in file order", () => {
    expect(modelRows(catalog, "claude-code", "native").map((row) => row.model)).toEqual([
      "fable",
      "opus",
    ]);
    expect(modelRows(catalog, "claude-code", "anthropic-gateway").map((row) => row.model)).toEqual([
      "kimi-k2.6",
    ]);
    expect(modelRows(catalog, "pi", "native")).toEqual([]);
  });
});

describe("entitlement", () => {
  it("answers per plan, and says nothing where the catalog says nothing", () => {
    expect(entitlement(catalog, "claude-code", "fable", "pro")).toBe("credits");
    expect(entitlement(catalog, "claude-code", "fable", "max20")).toBe("included");
    expect(entitlement(catalog, "claude-code", "opus", "pro")).toBe("unavailable");
    expect(entitlement(catalog, "claude-code", "opus", "max20")).toBeNull();
    expect(entitlement(catalog, "claude-code", "haiku", "pro")).toBeNull();
  });
});

describe("plans", () => {
  it("lists what a vendor sells and knows nothing of a tier it has no row for", () => {
    expect(plansForVendor(catalog, "claude").map((row) => row.id)).toEqual([
      "pro",
      "max5",
      "max20",
    ]);
    expect(plansForVendor(catalog, "chatgpt").map((row) => row.displayName)).toEqual(["Plus"]);
    expect(knowsPlan(catalog, "claude", "max20")).toBe(true);
    expect(knowsPlan(catalog, "chatgpt", "max20")).toBe(false);
    expect(knowsPlan(catalog, "claude", "max50")).toBe(false);
  });
});
