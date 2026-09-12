import { z } from "zod";
import type { HarnessId } from "./profile.js";
import type { EvidenceLevel } from "./recommendation.js";
import type { TaskIntent } from "./task-intent.js";

/** `unsupported` is a published catalog written for a schema this agn cannot read. */
export const CatalogUpdateOutcomeSchema = z.enum(["updated", "current", "unsupported"]);
export type CatalogUpdateOutcome = z.infer<typeof CatalogUpdateOutcomeSchema>;

/**
 * What one check of the published catalog found. It lives here rather than in `@agnostic/catalog`
 * because the state file, the daemon API and the CLI all speak it, and core is what they share.
 */
export type CatalogUpdate = {
  outcome: CatalogUpdateOutcome;
  localVersion: number;
  remoteVersion: number;
  /** When the published catalog was generated, as its manifest reports it. */
  generatedAt: string;
  remoteSchemaVersion: number;
  localSchemaVersion: number;
  /** Benchmark rows in the file now on disk; null for every outcome but `updated`. */
  benchmarkRows: number | null;
};

/** The contents of `~/.agnostic/catalog-check.json`: the last check, so the next one is a day off. */
export const CatalogCheckStateSchema = z.strictObject({
  checkedAt: z.iso.datetime(),
  outcome: z.union([CatalogUpdateOutcomeSchema, z.literal("failed")]),
  localVersion: z.number().int().nonnegative(),
  remoteVersion: z.number().int().positive().nullable(),
  /** One line saying why, on `failed` only. */
  message: z.string().nullable(),
});
export type CatalogCheckState = z.infer<typeof CatalogCheckStateSchema>;

/**
 * Which catalog the daemon is serving and when it last looked for a newer one. `origin` mirrors
 * the loader's origins; core cannot import the catalog package, so the daemon maps them across and
 * a new origin there is a type error here.
 */
export type CatalogSummary = {
  version: number;
  generatedAt: string;
  origin: "downloaded" | "bundled" | "empty";
  lastCheck: CatalogCheckState | null;
  checkEnabled: boolean;
};

/**
 * A benchmark row as `agn catalog show` prints it: the catalog's row flattened for the wire, with
 * the weight its age has left it and whether the last recommendation leaned on it.
 */
export type CatalogShowRow = {
  source: string;
  date: string;
  benchmark: string;
  model: string;
  /** null for a row that measured the model alone, which is weaker evidence. */
  harness: HarnessId | null;
  taskClass: TaskIntent;
  metric: string;
  score: number;
  weight: number;
  cited: boolean;
};

export const CatalogRowsQuerySchema = z.strictObject({ profile: z.string().min(1) });
export type CatalogRowsQuery = z.infer<typeof CatalogRowsQuerySchema>;

export type CatalogRowsResponse = {
  catalog: CatalogSummary;
  profileId: string;
  rows: CatalogShowRow[];
  /** The last recommendation, and only when the profile it picked is the one being shown. */
  cited: { evidence: EvidenceLevel; sources: string[] } | null;
};

export type CatalogUpdateResponse = { update: CatalogUpdate; catalog: CatalogSummary };
