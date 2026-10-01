import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId, Plan, PlanVendor } from "@agnostic/core";
import { z } from "zod";
import { grokSession } from "./grok-auth-file.js";
import type { HarnessDefinition } from "./harness-definition.js";
import { harnessIdentity } from "./harness-identity.js";

/** Which vendor bills a harness by plan, from its row; null is billed per provider key (ADR 016). */
export function planVendor(harness: HarnessId): PlanVendor | null {
  return harnessIdentity(harness).vendor;
}

/**
 * The plan the harness's own files say the user is on. Never throws and never guesses: a file that
 * is missing, unreadable, or silent is null, and doctor asks. The answer is the vendor's own name
 * for the tier, which the catalog's plans table decides the meaning of.
 */
export async function detectPlan(def: HarnessDefinition, home: string): Promise<Plan | null> {
  const source = def.planSource;
  if (!source) {
    return null;
  }
  let text: string;
  try {
    text = await readFile(join(home, source.file), "utf8");
  } catch {
    return null;
  }
  try {
    return source.parse(JSON.parse(text));
  } catch {
    // A half-written auth file says nothing about the plan; it does not make detection fail.
    return null;
  }
}

const ClaudeAccountSchema = z.looseObject({
  oauthAccount: z
    .looseObject({
      organizationRateLimitTier: z.string().min(1).nullish(),
      userRateLimitTier: z.string().min(1).nullish(),
    })
    .optional(),
});

/**
 * Claude Code records the account's rate limit tier, not the plan name: `default_claude_max_20x`
 * for Max 20x. The prefix is dropped and `max_20x` is written the way the plan page writes it, so
 * a tier agn has never seen still comes through as a name the catalog can learn.
 */
export function parseClaudePlan(contents: unknown): Plan | null {
  const parsed = ClaudeAccountSchema.safeParse(contents);
  const account = parsed.success ? parsed.data.oauthAccount : undefined;
  const tier = account?.organizationRateLimitTier ?? account?.userRateLimitTier;
  if (!tier) {
    return null;
  }
  const name = tier.replace(/^default_claude_/, "").replace(/^claude_/, "");
  return name === "" ? null : name.replace(/^max_(\d+)x$/, "max$1");
}

const CodexAuthSchema = z.looseObject({
  tokens: z.looseObject({ id_token: z.string().min(1).nullish() }).nullish(),
});

const PlanClaimSchema = z.looseObject({
  chatgpt_plan_type: z.string().min(1).nullish(),
  "https://api.openai.com/auth": z
    .looseObject({ chatgpt_plan_type: z.string().min(1).nullish() })
    .nullish(),
});

/** The one name agn translates: the id token says `team` where the plan page says Business. */
const CHATGPT_PLAN_ALIASES: Record<string, Plan> = { team: "business" };

/**
 * Codex's id token carries the plan as a claim. The payload is read for that one field and nothing
 * else: no signature check, because a token this process can only have read from the user's own
 * home is not evidence of anything but what the user's own CLI believes.
 */
export function parseCodexPlan(contents: unknown): Plan | null {
  const auth = CodexAuthSchema.safeParse(contents);
  const token = auth.success ? auth.data.tokens?.id_token : null;
  const payload = token ? decodeJwtPayload(token) : null;
  const claims = PlanClaimSchema.safeParse(payload);
  if (!claims.success) {
    return null;
  }
  const plan =
    claims.data["https://api.openai.com/auth"]?.chatgpt_plan_type ?? claims.data.chatgpt_plan_type;
  if (!plan) {
    return null;
  }
  const name = plan.toLowerCase();
  return CHATGPT_PLAN_ALIASES[name] ?? name;
}

function decodeJwtPayload(token: string): unknown {
  const [, payload, signature] = token.split(".");
  if (payload === undefined || signature === undefined) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * xAI is the one vendor of the four that names the tier in the auth file. The plan page spells it
 * `SuperGrok Heavy` and the catalog `supergrok-heavy`, so spaces and underscores become dashes;
 * a tier agn has never seen comes through as a name the catalog can learn.
 */
export function parseGrokPlan(contents: unknown): Plan | null {
  const tier = grokSession(contents)?.subscription_tier;
  if (!tier) {
    return null;
  }
  const name = tier
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return name === "" ? null : name;
}
