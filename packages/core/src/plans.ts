import { z } from "zod";

export const PlanVendorSchema = z.enum(["claude", "chatgpt"]);
export type PlanVendor = z.infer<typeof PlanVendorSchema>;

/**
 * A plan is whatever the vendor calls it. The set of plans per vendor is catalog data, not an
 * enum here, so a new tier needs a catalog refresh and never an agn release: a value agn does not
 * recognise is stored as it was read and reported as unknown to the catalog.
 */
export type Plan = string;

export const PlanSchema = z.string().min(1);

// Strict: a third vendor key is a mistake, because only these two bill by plan.
export const PlansSchema = z.strictObject({
  claude: PlanSchema.optional(),
  chatgpt: PlanSchema.optional(),
});
export type Plans = z.infer<typeof PlansSchema>;
