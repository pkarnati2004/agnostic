import { fileURLToPath } from "node:url";
import { type Catalog, readCatalogFile } from "@agnostic/catalog";
import {
  defaultPreferences,
  formatProfileId,
  type Preferences,
  type Profile,
} from "@agnostic/core";

// Not part of the package's exports: what every recommender test scores against.
export const NOW = new Date("2026-09-01T00:00:00.000Z");

/** Rows engineered for these tests, so nothing here depends on the catalog agn ships with. */
export async function fixtureCatalog(): Promise<Catalog> {
  const file = fileURLToPath(
    new URL("../../../tests/fixtures/catalog/recommender.json", import.meta.url),
  );
  // The recommender does not import the registry, so its fixture says which vendor bills what.
  const catalog = await readCatalogFile(file, { vendorOf: () => "claude" });
  if (catalog === null) {
    throw new Error(`the recommender fixture catalog is missing: ${file}`);
  }
  return catalog;
}

export function testProfile(over: Partial<Profile> = {}): Profile {
  const harness = over.harness ?? "claude-code";
  const model = over.model === undefined ? "opus" : over.model;
  const route = over.route ?? "native";
  return {
    id: formatProfileId(harness, model, route),
    harness,
    model,
    route,
    billing: "subscription",
    available: true,
    evidence: "binary",
    tier: 1,
    ...over,
  };
}

export function testPreferences(over: Partial<Preferences> = {}): Preferences {
  return { ...defaultPreferences(), ...over };
}
