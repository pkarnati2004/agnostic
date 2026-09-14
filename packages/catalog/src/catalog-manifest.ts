import { z } from "zod";

/**
 * The ~150 bytes the daily check reads, written beside `catalog.json` by the publishing Action.
 * It carries the version so a check that finds nothing new costs one small GET, and the checksum
 * so a truncated or tampered download is rejected before it is parsed.
 */
export const CatalogManifestSchema = z.strictObject({
  schemaVersion: z.number().int().positive(),
  version: z.number().int().positive(),
  generatedAt: z.iso.datetime(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type CatalogManifest = z.infer<typeof CatalogManifestSchema>;
