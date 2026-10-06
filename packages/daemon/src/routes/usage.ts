import {
  type HarnessId,
  type HarnessReport,
  type LimitWindow,
  type LimitWindowReport,
  limitFreshness,
  type PlanLimit,
  type PlanPresent,
  type Plans,
  planFor,
  type TaskUsageResponse,
  type UsageBreakdown,
  type UsageResponse,
  type UsageWindow,
} from "@agnostic/core";
import { harnesses, planVendor } from "@agnostic/registry";
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
      // One probe per request, outside the scan's snapshot: three readers below share these rows.
      const reports = (await ctx.detection.current()).harnesses;
      const plans = plansInUse(reports, config.plans);
      const installed = installedHarnesses(reports);
      const { catalog } = ctx.catalog.current();
      const read = (kind: "day" | "week") => {
        const bounds: UsageWindow = usageWindow(kind, scannedAt);
        const rows = summarize(ctx, bounds);
        // The budget counts the same rows the plan cells are built from: one read per window.
        return {
          window: bounds,
          plans: summarizePlans(rows, plans, planVendor, catalog),
          spent: spentUsd(rows),
        };
      };
      const day = read("day");
      const week = read("week");
      const body: UsageResponse = {
        day: { window: day.window, plans: day.plans },
        week: { window: week.window, plans: week.plans },
        budget: budgetReport(config.budget, { day: day.spent, week: week.spent }),
        limits: await planLimits(ctx, scannedAt),
        present: presentPlans(installed, plans),
        unavailable: unavailableHarnesses(installed),
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
 * What the harnesses last said about their plans' own meters, from the two sources a registry row
 * can name: a rollout record, which the scan above already read, and the file agn's status-line
 * script writes. One row per harness, the newer observation winning.
 */
async function planLimits(ctx: DaemonContext, scannedAt: Date): Promise<PlanLimit[]> {
  const observed: ObservedLimit[] = [...ctx.usage.limits()];
  for (const row of harnesses.filter((def) => def.limitSource === "statusline")) {
    const limit = await readRateLimitsFile(ctx.paths, row.id, ctx.log);
    if (limit !== null) {
      observed.push(limit);
    }
  }
  const newest = new Map<string, ObservedLimit>();
  for (const limit of observed) {
    const seen = newest.get(limit.harness);
    if (seen === undefined || seen.observedAt <= limit.observedAt) {
      newest.set(limit.harness, limit);
    }
  }
  return [...newest.values()].map((limit) => ({
    harness: limit.harness,
    vendor: planVendor(limit.harness),
    fiveHour: report(limit.fiveHour, limit.observedAt, scannedAt),
    week: report(limit.week, limit.observedAt, scannedAt),
    observedAt: limit.observedAt,
    source: limit.source,
    detail: limit.detail,
  }));
}

/** The harnesses detection found a binary for; a row with no path is one this machine lacks. */
function installedHarnesses(reports: HarnessReport[]): Set<HarnessId> {
  return new Set(reports.filter((report) => report.path !== null).map((report) => report.harness));
}

/**
 * The installed harnesses something on this machine counts tokens for, labelled with the plan
 * `summarizePlans` labels their rows with. The bar and `agn usage` keep a row for each one through
 * a window that counted nothing, so the Monday after a Saturday turn reads as an empty week and
 * not as a missing agent (ADR 029, amended 2026-10-06).
 */
function presentPlans(installed: Set<HarnessId>, plans: Plans): PlanPresent[] {
  return harnesses
    .filter((def) => def.usageSource !== null && installed.has(def.id))
    .map((def) => {
      const vendor = planVendor(def.id);
      return {
        harness: def.id,
        vendor,
        plan: planFor(vendor, plans),
      };
    });
}

/**
 * The harnesses on this machine that record no usage anywhere agn can read. The bar and
 * `agn usage` name them rather than leave them out, so a missing agent reads as "nothing on this
 * machine counts it" instead of as zero tokens (ADR 029). A harness that is not installed is
 * never named.
 */
function unavailableHarnesses(installed: Set<HarnessId>): HarnessId[] {
  return harnesses
    .filter((def) => def.usageSource === null && installed.has(def.id))
    .map((def) => def.id);
}

/**
 * The figure's state at the instant this response was built. The bar and `agn usage` recompute it
 * from `observedAt` with their own clock, so a figure crosses two hours on screen without a
 * reload; the stamp is for a script reading the body as it stands.
 */
function report(
  window: LimitWindow | null,
  observedAt: string,
  scannedAt: Date,
): LimitWindowReport | null {
  return window === null
    ? null
    : { ...window, freshness: limitFreshness(window, observedAt, scannedAt) };
}

/** The plan each vendor's rows are labelled with: what detection read, else what the user wrote. */
function plansInUse(reports: HarnessReport[], configured: Plans): Plans {
  const detected: Plans = { ...configured };
  for (const report of reports) {
    if (report.planVendor !== null && report.plan !== null) {
      detected[report.planVendor] = report.plan.value;
    }
  }
  return detected;
}

function summarize(ctx: DaemonContext, window: UsageWindow): UsageBreakdown[] {
  return ctx.ledger.usage.summarize({ since: window.since, until: window.until });
}
