import { z } from "zod";

export const PlanVendorSchema = z.enum([
  "claude",
  "chatgpt",
  "google",
  "xai",
  "moonshot",
  "cursor",
]);
export type PlanVendor = z.infer<typeof PlanVendorSchema>;

/**
 * A plan is whatever the vendor calls it. The set of plans per vendor is catalog data, not an
 * enum here, so a new tier needs a catalog refresh and never an agn release: a value agn does not
 * recognise is stored as it was read and reported as unknown to the catalog.
 */
export type Plan = string;

export const PlanSchema = z.string().min(1);

// Strict: a key outside this set is a mistake, because no other vendor bills a CLI by plan
// (ADR 016, amended 2026-09-21).
export const PlansSchema = z.strictObject({
  claude: PlanSchema.optional(),
  chatgpt: PlanSchema.optional(),
  google: PlanSchema.optional(),
  xai: PlanSchema.optional(),
  moonshot: PlanSchema.optional(),
  cursor: PlanSchema.optional(),
});
export type Plans = z.infer<typeof PlansSchema>;
