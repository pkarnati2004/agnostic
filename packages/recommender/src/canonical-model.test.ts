import type { Catalog } from "@agnostic/catalog";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalModel } from "./canonical-model.js";
import { fixtureCatalog, testProfile } from "./test-catalog.js";

let catalog: Catalog;

beforeAll(async () => {
  catalog = await fixtureCatalog();
});

describe("canonicalModel", () => {
  it("joins a harness's own name for a model to the id every table uses", () => {
    expect(canonicalModel(catalog, testProfile({}))).toBe("anthropic/claude-opus-5");
  });

  it("lets a model the catalog has never heard of stand for itself", () => {
    expect(canonicalModel(catalog, testProfile({ model: "opus-6" }))).toBe("opus-6");
  });

  it("has nothing to join for a profile on the harness's own default model", () => {
    expect(canonicalModel(catalog, testProfile({ model: null }))).toBeNull();
  });
});
