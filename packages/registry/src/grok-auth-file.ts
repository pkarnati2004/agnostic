import { z } from "zod";

/**
 * One issuer's entry in `~/.grok/auth.json`. `key` is the access token the CLI sends, and
 * `subscription_tier` is the one place any of these four vendors names the plan on disk.
 */
const GrokEntrySchema = z.looseObject({
  key: z.string().min(1),
  expires_at: z.string().min(1).nullish().catch(null),
  subscription_tier: z.string().min(1).nullish().catch(null),
});

export type GrokSession = z.infer<typeof GrokEntrySchema>;

const GrokAuthFileSchema = z.record(z.string(), z.unknown());

/** Stale alternate issuers can precede the default xAI session, so that one is preferred. */
const PREFERRED_ISSUER = "https://auth.x.ai";

/** A token this close to expiry is spent; the CLI has refreshed it into a later entry. */
const SKEW_MS = 5 * 60 * 1000;

/**
 * The session `~/.grok/auth.json` holds, or null when nothing in it carries a token - which is
 * what `grok logout` leaves behind, not a failure. An entry keyed by another issuer is read only
 * when the file has no `auth.x.ai` entry at all, and an expired default entry only when no fresh
 * one follows it, because the fresh one carries the current tier.
 */
export function grokSession(contents: unknown): GrokSession | null {
  const file = GrokAuthFileSchema.safeParse(contents);
  if (!file.success) {
    return null;
  }
  let preferredSeen = false;
  let expired: GrokSession | null = null;
  let alternate: GrokSession | null = null;
  for (const [issuer, value] of Object.entries(file.data)) {
    const preferred = isPreferred(issuer);
    preferredSeen ||= preferred;
    const entry = GrokEntrySchema.safeParse(value);
    if (!entry.success) {
      continue;
    }
    if (!preferred) {
      alternate ??= entry.data;
    } else if (fresh(entry.data)) {
      return entry.data;
    } else {
      expired ??= entry.data;
    }
  }
  return expired ?? (preferredSeen ? null : alternate);
}

function isPreferred(issuer: string): boolean {
  return issuer === PREFERRED_ISSUER || issuer.startsWith(`${PREFERRED_ISSUER}::`);
}

/** An entry without a usable expiry counts as fresh: a spent token fails at the first request. */
function fresh(entry: GrokSession): boolean {
  const expiry = entry.expires_at ? Date.parse(entry.expires_at) : Number.NaN;
  return !Number.isFinite(expiry) || expiry - Date.now() > SKEW_MS;
}
