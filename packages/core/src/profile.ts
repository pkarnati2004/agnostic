import { z } from "zod";
import { CoreError } from "./error.js";

export const HarnessIdSchema = z.union([
  z.enum(["claude-code", "codex", "pi", "opencode"]),
  z.templateLiteral(["other:", z.string().min(1)]),
]);
export type HarnessId = z.infer<typeof HarnessIdSchema>;

export const RouteSchema = z.enum([
  "native",
  "anthropic-gateway",
  "openai-compatible",
  "openrouter",
  "local",
]);
export type Route = z.infer<typeof RouteSchema>;

export const BillingSchema = z.enum(["subscription", "api-key", "local", "unknown"]);
export type Billing = z.infer<typeof BillingSchema>;

export const EvidenceSchema = z.enum(["hook", "env", "binary", "port"]);
export type Evidence = z.infer<typeof EvidenceSchema>;

const DEFAULT_MODEL_SEGMENT = "default";

export function formatProfileId(harness: HarnessId, model: string | null, route: Route): string {
  return `${harness}:${model ?? DEFAULT_MODEL_SEGMENT}:${route}`;
}

export function parseProfileId(id: string): {
  harness: HarnessId;
  model: string | null;
  route: Route;
} {
  // The first colon ends the harness, the last starts the route, everything between is the model
  // verbatim, so "codex:qwen3:8b:local" is legal.
  const segments = id.split(":");
  const harnessLength = segments[0] === "other" ? 2 : 1;
  const harness = segments.slice(0, harnessLength).join(":");
  const model = segments.slice(harnessLength, -1).join(":");
  const route = segments.length > harnessLength ? segments[segments.length - 1] : undefined;
  const parsed = z
    .object({ harness: HarnessIdSchema, model: z.string().min(1), route: RouteSchema })
    .safeParse({ harness, model, route });
  if (!parsed.success) {
    throw new CoreError(`"${id}" is not a profile id`, {
      code: "invalid-profile-id",
      hint: "A profile id looks like claude-code:sonnet-4.5:native.",
      cause: parsed.error,
    });
  }
  return {
    harness: parsed.data.harness,
    model: parsed.data.model === DEFAULT_MODEL_SEGMENT ? null : parsed.data.model,
    route: parsed.data.route,
  };
}

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
