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
  const segments = id.split(":");
  const route = segments.pop();
  const model = segments.pop();
  // Whatever is left is the harness, so "other:aider" survives the split.
  const harness = segments.join(":");
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
