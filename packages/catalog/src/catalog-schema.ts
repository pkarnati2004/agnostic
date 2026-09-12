import {
  type HarnessId,
  HarnessIdSchema,
  PlanSchema,
  type PlanVendor,
  PlanVendorSchema,
  RouteSchema,
  TaskIntentSchema,
} from "@agnostic/core";
import { z } from "zod";
import { CatalogError } from "./error.js";

/** Bumped only when a row shape changes in a way an older agn cannot read. */
export const CATALOG_SCHEMA_VERSION = 1;

const NonEmpty = z.string().min(1);

/** Where a number came from: the page, what it may be used under, and the day it was read. */
const SourceRowSchema = z.strictObject({
  id: NonEmpty,
  name: NonEmpty,
  url: z.url(),
  terms: NonEmpty,
  fetchedAt: z.iso.date(),
});
export type SourceRow = z.infer<typeof SourceRowSchema>;

/**
 * One published result. `model` is a canonical `vendor/name` id; `harness` is null for a row that
 * measures the model alone, which is weaker evidence than a row naming the harness that ran it.
 */
export const BenchmarkRowSchema = z.strictObject({
  source: NonEmpty,
  date: z.iso.date(),
  benchmark: NonEmpty,
  model: NonEmpty,
  modelVersion: NonEmpty.nullable(),
  harness: HarnessIdSchema.nullable(),
  harnessVersion: NonEmpty.nullable(),
  taskClass: TaskIntentSchema,
  metric: NonEmpty,
  score: z.number().min(0).max(100),
  n: z.number().int().positive().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  tokens: z.number().int().nonnegative().nullable(),
  notes: z.string(),
});
export type BenchmarkRow = z.infer<typeof BenchmarkRowSchema>;

/** What a harness answers to on a route, and the canonical id that joins it to every other table. */
export const ModelRowSchema = z.strictObject({
  harness: HarnessIdSchema,
  model: NonEmpty,
  route: RouteSchema,
  canonical: NonEmpty.nullable(),
  /** Still launchable and still scored, but not what agn suggests. */
  legacy: z.boolean().default(false),
});
export type ModelRow = z.infer<typeof ModelRowSchema>;

/** A tier a vendor sells. `confirmedAt` is the day the set was last checked against its plan page. */
export const PlanRowSchema = z.strictObject({
  vendor: PlanVendorSchema,
  id: PlanSchema,
  displayName: NonEmpty,
  confirmedAt: z.iso.date(),
});
export type PlanRow = z.infer<typeof PlanRowSchema>;

export const EntitlementAccessSchema = z.enum(["included", "credits", "unavailable"]);
export type EntitlementAccess = z.infer<typeof EntitlementAccessSchema>;

/**
 * Which vendor's plans each harness is billed on. The registry has the same two rows for its own
 * use; they are repeated here because the catalog cannot import the registry, and because a row
 * that pairs Codex with a Claude plan is a mistake in the data, not in the code that reads it.
 */
const ENTITLEMENT_VENDORS: Partial<Record<HarnessId, PlanVendor>> = {
  "claude-code": "claude",
  codex: "chatgpt",
};

/** Listed is not included (ADR 016): a plan may list a model and still meter it as credits. */
export const EntitlementRowSchema = z
  .strictObject({
    harness: HarnessIdSchema,
    model: NonEmpty,
    vendor: PlanVendorSchema,
    plan: PlanSchema,
    access: EntitlementAccessSchema,
  })
  .refine((row) => ENTITLEMENT_VENDORS[row.harness] === row.vendor, {
    error:
      "claude-code rows carry claude plans and codex rows chatgpt plans; no other harness has one",
    path: ["vendor"],
  });
export type EntitlementRow = z.infer<typeof EntitlementRowSchema>;

/** USD per million tokens, keyed by canonical id. `curated` is a hand-written override. */
const PricingRowSchema = z.strictObject({
  model: NonEmpty,
  inputPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
  cacheReadPerMillion: z.number().nonnegative().nullable(),
  cacheWritePerMillion: z.number().nonnegative().nullable(),
  source: z.enum(["openrouter", "curated"]),
  asOf: z.iso.date(),
});
export type PricingRow = z.infer<typeof PricingRowSchema>;

export const CatalogSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  version: z.number().int().positive(),
  generatedAt: z.iso.datetime(),
  sources: z.array(SourceRowSchema),
  benchmarks: z.array(BenchmarkRowSchema),
  models: z.array(ModelRowSchema),
  plans: z.array(PlanRowSchema),
  entitlements: z.array(EntitlementRowSchema),
  pricing: z.array(PricingRowSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

const VersionProbeSchema = z.looseObject({ schemaVersion: z.number().int() });

/**
 * The one way a catalog file becomes a `Catalog`. A file written for a newer schema is told apart
 * from a broken one, because the two need different things from the user.
 */
export function parseCatalog(raw: unknown): Catalog {
  const probe = VersionProbeSchema.safeParse(raw);
  if (probe.success && probe.data.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new CatalogError(
      `catalog schema version ${probe.data.schemaVersion} is not version ${CATALOG_SCHEMA_VERSION}`,
      {
        code: "catalog-schema-unsupported",
        hint: "Update agn: this catalog was written for a newer version.",
      },
    );
  }
  const parsed = CatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalid(describeIssue(parsed.error), parsed.error);
  }
  const missing = danglingReference(parsed.data);
  if (missing) {
    throw invalid(missing, undefined);
  }
  return parsed.data;
}

/** `benchmarks[3].score` rather than `benchmarks.3.score`: the row index is what a fixer needs. */
function describeIssue(error: z.ZodError): string {
  const [issue] = error.issues;
  if (!issue) {
    return "unknown issue";
  }
  const path = issue.path
    .map((step) => (typeof step === "number" ? `[${step}]` : `.${String(step)}`))
    .join("")
    .replace(/^\./, "");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Rows point at each other by id, so a catalog that parses can still be inconsistent. */
function danglingReference(catalog: Catalog): string | null {
  const sources = new Set(catalog.sources.map((source) => source.id));
  const plans = new Set(catalog.plans.map((plan) => `${plan.vendor}:${plan.id}`));
  for (const [index, row] of catalog.benchmarks.entries()) {
    if (!sources.has(row.source)) {
      return `benchmarks[${index}].source: no source row "${row.source}"`;
    }
  }
  for (const [index, row] of catalog.entitlements.entries()) {
    if (!plans.has(`${row.vendor}:${row.plan}`)) {
      return `entitlements[${index}].plan: no plan row "${row.vendor}/${row.plan}"`;
    }
  }
  return null;
}

function invalid(detail: string, cause: unknown): CatalogError {
  return new CatalogError(`catalog is not valid: ${detail}`, {
    code: "catalog-invalid",
    hint: "Delete ~/.agnostic/catalog.json to fall back to the catalog agn ships with.",
    cause,
  });
}
