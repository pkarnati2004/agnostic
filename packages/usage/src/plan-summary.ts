import type {
  HarnessId,
  Plans,
  PlanUsage,
  PlanVendor,
  UsageBreakdown,
  UsageSum,
} from "@agnostic/core";

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
    return {
      harness,
      vendor,
      plan: (vendor === null ? undefined : plans[vendor]) ?? null,
      usage: total(group),
      unattributedTokens: group
        .filter((row) => !row.attributed)
        .reduce((sum, row) => sum + row.tokens, 0),
      fableShare: vendor === "claude" ? fableShare(group) : null,
    };
  });
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
