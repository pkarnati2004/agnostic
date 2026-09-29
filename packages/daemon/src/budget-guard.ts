import type { BudgetReport, BudgetWindow, Profile, UsageWindow } from "@agnostic/core";
import { usageWindow } from "@agnostic/usage";
import type { DaemonContext } from "./app.js";
import { budgetReport, countsAgainstBudget, overBudget, spentUsd } from "./budget.js";
import { type BudgetConfig, readDaemonConfig } from "./daemon-config.js";
import { DaemonError } from "./error.js";

type GuardContext = Pick<DaemonContext, "ledger" | "paths" | "usage">;

/**
 * ADR 036 Q9: a run or a handoff onto a profile billed by the token stops at 100%. A subscription
 * or local profile is never counted and never refused, and a resume is never refused at all, so
 * work already under way always continues. The transcripts are read first, so a refusal includes
 * the turn the agent finished a minute ago; with no ceiling set, nothing is read at all.
 */
export async function assertWithinBudget(
  ctx: GuardContext,
  profile: Profile,
  ignore: boolean,
): Promise<void> {
  if (ignore || !countsAgainstBudget(profile.billing)) {
    return;
  }
  const { budget } = await readDaemonConfig(ctx.paths);
  if (budget.dailyUsd === null && budget.weeklyUsd === null) {
    return;
  }
  await ctx.usage.scan();
  const over = overBudget(reportFor(ctx, budget, new Date()));
  if (over !== null) {
    throw refusal(over.window, over.budget);
  }
}

/**
 * What the ledger holds now against the ceilings, read after the scan. A window with no ceiling
 * is never summed: the report leaves it null either way.
 */
function reportFor(ctx: GuardContext, budget: BudgetConfig, at: Date): BudgetReport {
  return budgetReport(budget, {
    day: budget.dailyUsd === null ? 0 : priced(ctx, usageWindow("day", at)),
    week: budget.weeklyUsd === null ? 0 : priced(ctx, usageWindow("week", at)),
  });
}

function priced(ctx: GuardContext, window: UsageWindow): number {
  return spentUsd(ctx.ledger.usage.summarize({ since: window.since, until: window.until }));
}

/** The message carries both figures and the hint the exact key, so the refusal explains itself. */
function refusal(window: "day" | "week", budget: BudgetWindow): DaemonError {
  const spent = window === "day" ? "today's" : "this week's";
  const named = window === "day" ? "daily" : "weekly";
  const key = window === "day" ? "daily_usd" : "weekly_usd";
  return new DaemonError(
    `${spent} priced spend is ${money(budget.spentUsd)}, over the ${money(budget.limitUsd)} ${named} budget`,
    {
      code: "budget-exceeded",
      hint: `Pass --ignore-budget to run this task anyway, or raise budget.${key} in ~/.agnostic/config.yaml.`,
    },
  );
}

function money(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
