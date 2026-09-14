import type {
  Plans,
  TaskUsageResponse,
  UsageBreakdown,
  UsageResponse,
  UsageWindow,
} from "@agnostic/core";
import { planVendor } from "@agnostic/registry";
import { summarizePlans, usageWindow } from "@agnostic/usage";
import { Hono } from "hono";
import type { DaemonContext } from "../app.js";
import { readDaemonConfig } from "../daemon-config.js";
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
      const scannedAt = new Date();
      await ctx.usage.scan();
      const plans = await plansInUse(ctx);
      const window = (kind: "day" | "week") => {
        const bounds: UsageWindow = usageWindow(kind, scannedAt);
        return { window: bounds, plans: summarizePlans(summarize(ctx, bounds), plans, planVendor) };
      };
      const body: UsageResponse = {
        day: window("day"),
        week: window("week"),
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

/** The plan each vendor's rows are labelled with: what detection read, else what the user wrote. */
async function plansInUse(ctx: DaemonContext): Promise<Plans> {
  const { plans } = await readDaemonConfig(ctx.paths);
  const detected: Plans = { ...plans };
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
