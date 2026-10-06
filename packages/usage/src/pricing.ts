// Adapted from asheshgoplani/agent-deck (MIT © Ashesh Goplani).
// The rates are catalog data (ADR 011), so there is no table and no override precedence here.
import type { Catalog, ModelRow, PricingRow } from "@agnostic/catalog";
import type { Billing, HarnessId } from "@agnostic/core";
import type { PriceableTurn } from "./transcript-parser.js";

export type TokenBuckets = {
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite: number | null;
};

/** Cost is carried to the cent of a cent: a turn can be worth less than a thousandth of a dollar. */
const DECIMALS = 6;

/** A run the user is not billed for by the token; its tokens are still counted against the plan. */
const INCLUDED: Billing[] = ["subscription", "local"];

/**
 * The rates for a model as the harness named it. The catalog's `models` table carries the
 * canonical id for what each harness answers to, so that join comes first; a model the table does
 * not list is matched on the name itself, which is how a dated release meets its undated row.
 */
export function pricingRow(
  harness: HarnessId,
  model: string,
  models: ModelRow[],
  pricing: PricingRow[],
): PricingRow | null {
  const canonical = models.find((row) => row.harness === harness && row.model === model)?.canonical;
  const byCanonical =
    canonical === undefined || canonical === null
      ? undefined
      : pricing.find((row) => row.model === canonical);
  if (byCanonical !== undefined) {
    return byCanonical;
  }
  const wanted = normalize(model);
  return pricing.find((row) => normalize(row.model) === wanted) ?? null;
}

/**
 * What those tokens cost at those rates, or null when they cannot be priced from what is stored:
 * a cache bucket with tokens in it and no rate for them would otherwise be billed as free.
 */
export function priceTokens(buckets: TokenBuckets, row: PricingRow): number | null {
  const parts: [number, number | null][] = [
    [buckets.input, row.inputPerMillion],
    [buckets.output, row.outputPerMillion],
    [buckets.cacheRead ?? 0, row.cacheReadPerMillion],
    [buckets.cacheWrite ?? 0, row.cacheWritePerMillion],
  ];
  let total = 0;
  for (const [tokens, perMillion] of parts) {
    if (perMillion === null) {
      if (tokens > 0) {
        return null;
      }
      continue;
    }
    total += (tokens * perMillion) / 1_000_000;
  }
  return round(total);
}

/**
 * What one turn cost the user. A model on a subscription costs nothing extra however many tokens
 * it used; credits and API keys are metered, and `unknown` is priced like a key so that a cost
 * agn cannot rule out is shown rather than hidden. A cost the harness wrote itself beats agn's
 * estimate, because it is the figure the provider billed.
 */
export function costForTurn(
  turn: PriceableTurn,
  billing: Billing | null,
  catalog: Catalog,
): number | null {
  if (billing === null || INCLUDED.includes(billing)) {
    return null;
  }
  if (turn.costUsd !== null) {
    return turn.costUsd;
  }
  if (turn.model === null) {
    return null;
  }
  const row = pricingRow(turn.harness, turn.model, catalog.models, catalog.pricing);
  if (row === null) {
    return null;
  }
  return priceTokens(
    {
      input: turn.tokensInput,
      output: turn.tokensOutput,
      cacheRead: turn.tokensCacheRead,
      cacheWrite: turn.tokensCacheWrite,
    },
    row,
  );
}

/** `anthropic/claude-opus-4.8` and `claude-opus-4-8-20260501` are the same model to a price list. */
function normalize(model: string): string {
  return model
    .toLowerCase()
    .replace(/^[^/]+\//, "")
    .replaceAll(".", "-")
    .replace(/-\d{8}$/, "");
}

function round(value: number): number {
  const factor = 10 ** DECIMALS;
  return Math.round(value * factor) / factor;
}
