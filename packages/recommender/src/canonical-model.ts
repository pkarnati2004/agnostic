import type { Catalog } from "@agnostic/catalog";
import type { Profile } from "@agnostic/core";

/**
 * The id every catalog table joins on. A `:default:` profile has no model at all, which is why it
 * can carry no evidence and no price; a model the catalog does not list stands for itself.
 */
export function canonicalModel(catalog: Catalog, profile: Profile): string | null {
  if (profile.model === null) {
    return null;
  }
  const row = catalog.models.find(
    (candidate) =>
      candidate.harness === profile.harness &&
      candidate.model === profile.model &&
      candidate.route === profile.route,
  );
  return row?.canonical ?? profile.model;
}
