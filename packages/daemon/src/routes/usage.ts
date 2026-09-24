import type {
  PlanLimit,
  Plans,
  TaskUsageResponse,
  UsageBreakdown,
  UsageResponse,
  UsageWindow,
} from "@agnostic/core";
import { planVendor } from "@agnostic/registry";
import { type ObservedLimit, summarizePlans, usageWindow } from "@agnostic/usage";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { budgetReport, spentUsd } from "../budget.js";
import { readDaemonConfig } from "../daemon-config.js";
import { readRateLimitsFile } from "../rate-limits-file.js";
import { resolveTaskId } from "../resolve-id.js";
import { billingForProfile } from "../usage-scan.js";

/**
 * Both windows come back from one call, because they come from one scan (ADR 021). The scan reads
 * the transcript files before answering; an unchanged tree costs a stat per file, so this stays a
 * plain GET.
 */
export function usageRoutes(ctx: DaemonContext): Hono {
  return new Hono()
    .get("/usage", async (c) => {
      await ctx.usage.scan();
      // After the scan, not before: a turn the harness writes while the scan runs must be inside
      // the window the answer reports, and the window is half-open on `until`.
      const scannedAt = new Date();
      const config = await readDaemonConfig(ctx.paths);
      const plans = await plansInUse(ctx, config.plans);
      const read = (kind: "day" | "week") => {
        const bounds: UsageWindow = usageWindow(kind, scannedAt);
        const rows = summarize(ctx, bounds);
        // The budget counts the same rows the plan cells are built from: one read per window.
        return {
          window: bounds,
          plans: summarizePlans(rows, plans, planVendor),
          spent: spentUsd(rows),
        };
      };
      const day = read("day");
      const week = read("week");
      const body: UsageResponse = {
        day: { window: day.window, plans: day.plans },
        week: { window: week.window, plans: week.plans },
        budget: budgetReport(config.budget, { day: day.spent, week: week.spent }),
        limits: await planLimits(ctx),
        scannedAt: scannedAt.toISOString(),
      };
      return c.json(body);
    })
    .get("/tasks/:id/usage", async (c) => {
      const task = resolveTaskId(ctx.ledger, c.req.param("id"));
      await ctx.usage.scan({ taskId: task.id });
      const body: TaskUsageResponse = {
        task,
        usage: ctx.ledger.usage.sumForTask(task.id),
        billing: await billingForProfile(ctx.detection, task.profileId),
      };
      return c.json(body);
    });
}

/**
 * What the harnesses last said about their plans' own meters, from the two sources this machine
 * has: Codex's rollouts, which the scan above already read, and the file agn's status-line command
 * writes for Claude Code. One row per harness, the newer observation winning.
 */
async function planLimits(ctx: DaemonContext): Promise<PlanLimit[]> {
  const observed: ObservedLimit[] = [...ctx.usage.limits()];
  const claude = await readRateLimitsFile(ctx.paths, "claude-code", ctx.log);
  if (claude !== null) {
    observed.push(claude);
  }
  const newest = new Map<string, ObservedLimit>();
  for (const limit of observed) {
    const seen = newest.get(limit.harness);
    if (seen === undefined || seen.observedAt <= limit.observedAt) {
      newest.set(limit.harness, limit);
    }
  }
  return [...newest.values()].map((limit) => ({ ...limit, vendor: planVendor(limit.harness) }));
}

/** The plan each vendor's rows are labelled with: what detection read, else what the user wrote. */
async function plansInUse(ctx: DaemonContext, configured: Plans): Promise<Plans> {
  const detected: Plans = { ...configured };
  // One probe per request, outside the scan's snapshot: the label is the plan detection reads now.
  for (const report of (await ctx.detection.current()).harnesses) {
    if (report.planVendor !== null && report.plan !== null) {
      detected[report.planVendor] = report.plan.value;
    }
  }
  return detected;
}

function summarize(ctx: DaemonContext, window: UsageWindow): UsageBreakdown[] {
  return ctx.ledger.usage.summarize({ since: window.since, until: window.until });
}
