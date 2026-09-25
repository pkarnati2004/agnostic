import { z } from "zod";
import { formatProfileId, isHarnessId, parseProfileId, ROUTES } from "./profile-id.js";

export const HarnessIdSchema = z
  .string()
  .refine(isHarnessId, { error: "expected a harness id like codex, or other:<binary>" });

export const RouteSchema = z.enum(ROUTES);

// `credits` is a model that runs on the user's login but is metered on their plan (ADR 016).
export const BillingSchema = z.enum(["subscription", "credits", "api-key", "local", "unknown"]);
export type Billing = z.infer<typeof BillingSchema>;

// `unknown-plan` is "the harness is here and logged in, but agn does not know what the plan includes".
export const EvidenceSchema = z.enum(["hook", "env", "binary", "port", "unknown-plan"]);
export type Evidence = z.infer<typeof EvidenceSchema>;

// `.ag/` files store profile ids as plain strings; parseProfileId stays the one definition of the shape.
export const ProfileIdSchema = z.string().refine(
  (id) => {
    try {
      parseProfileId(id);
      return true;
    } catch {
      // The thrown CoreError says the same thing the zod issue will; false is the whole answer here.
      return false;
    }
  },
  { error: "expected a profile id like claude-code:sonnet-4.5:native" },
);

export const ProfileSchema = z
  .object({
    id: z.string().min(1),
    harness: HarnessIdSchema,
    model: z.string().min(1).nullable(),
    route: RouteSchema,
    billing: BillingSchema,
    available: z.boolean(),
    evidence: EvidenceSchema,
    tier: z.union([z.literal(1), z.literal(2)]),
  })
  .refine(
    (profile) => profile.id === formatProfileId(profile.harness, profile.model, profile.route),
    {
      error: "id must be harness:model:route",
      path: ["id"],
    },
  );
export type Profile = z.infer<typeof ProfileSchema>;
