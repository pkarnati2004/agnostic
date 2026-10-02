import type { Catalog } from "@agnostic/catalog";
import type {
  HarnessId,
  Plans,
  PlanUsage,
  PlanVendor,
  UsageBreakdown,
  UsageSum,
} from "@agnostic/core";
import { priceTokens, pricingRow } from "./pricing.js";

/** The two catalog tables a price comes from; the rest of the catalog says nothing about cost. */
type Rates = Pick<Catalog, "models" | "pricing">;

/** ADR 016: the v1 usage bar draws a line at half a Claude plan's Fable allowance. */
const FABLE = "fable";

/**
 * One row per harness that spent anything in the window, in the order the rows arrived. The plan
 * is what the daemon detected or the user declared; a harness billed per provider key has none,
 * and its row still shows what it spent.
 */
export function summarizePlans(
  rows: UsageBreakdown[],
  plans: Plans,
  vendorOf: (harness: HarnessId) => PlanVendor | null,
  catalog: Rates,
): PlanUsage[] {
  const perHarness = new Map<HarnessId, UsageBreakdown[]>();
  for (const row of rows) {
    const group = perHarness.get(row.harness);
    if (group === undefined) {
      perHarness.set(row.harness, [row]);
    } else {
      group.push(row);
    }
  }
  return [...perHarness].map(([harness, group]) => {
    const vendor = vendorOf(harness);
    const usage = total(group);
    return {
      harness,
      vendor,
      plan: (vendor === null ? undefined : plans[vendor]) ?? null,
      usage,
      unattributedTokens: group
        .filter((row) => !row.attributed)
        .reduce((sum, row) => sum + row.tokens, 0),
      fableShare: vendor === "claude" ? fableShare(group) : null,
      apiRateUsd: vendor === null || usage.costUsd !== null ? null : apiRateUsd(group, catalog),
    };
  });
}

/** Cost is carried to the cent of a cent, as `priceTokens` carries it. */
const DECIMALS = 6;

/**
 * What a plan's tokens would have cost on an API key, priced row by row as metered spend is. Null
 * when any row with tokens has no rate, because a partial total would read as the whole bill.
 * Unattributed rows are priced too: the plan's meter counted them.
 */
function apiRateUsd(rows: UsageBreakdown[], catalog: Rates): number | null {
  let total = 0;
  for (const row of rows) {
    if (row.tokens === 0) {
      continue;
    }
    if (row.model === null) {
      return null;
    }
    const price = pricingRow(row.harness, row.model, catalog.models, catalog.pricing);
    if (price === null) {
      return null;
    }
    const cost = priceTokens(
      {
        input: row.tokensInput ?? 0,
        output: row.tokensOutput ?? 0,
        cacheRead: row.tokensCacheRead,
        cacheWrite: row.tokensCacheWrite,
      },
      price,
    );
    if (cost === null) {
      return null;
    }
    total += cost;
  }
  const factor = 10 ** DECIMALS;
  return Math.round(total * factor) / factor;
}

/** Null rather than zero when nothing was counted: no tokens is no evidence about the mix. */
function fableShare(rows: UsageBreakdown[]): number | null {
  const tokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  if (tokens === 0) {
    return null;
  }
  const fable = rows
    .filter((row) => row.model?.toLowerCase().includes(FABLE) === true)
    .reduce((sum, row) => sum + row.tokens, 0);
  return fable / tokens;
}

function total(rows: UsageBreakdown[]): UsageSum {
  return {
    tokens: rows.reduce((sum, row) => sum + row.tokens, 0),
    tokensInput: add(rows.map((row) => row.tokensInput)),
    tokensOutput: add(rows.map((row) => row.tokensOutput)),
    tokensCacheRead: add(rows.map((row) => row.tokensCacheRead)),
    tokensCacheWrite: add(rows.map((row) => row.tokensCacheWrite)),
    costUsd: add(rows.map((row) => row.costUsd)),
  };
}

/** Null means no row reported this bucket at all, which is not the same as zero tokens in it. */
function add(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
}
