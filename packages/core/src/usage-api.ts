import type { Billing } from "./profile.js";
import type { HarnessId } from "./profile-id.js";
import type { Task } from "./task.js";
import type {
  BudgetReport,
  PlanLimit,
  PlanPresent,
  PlanUsage,
  UsageSum,
  UsageWindow,
} from "./usage.js";

// What the two usage endpoints answer with: `GET /usage` for the windows every plan spent in, and
// `GET /tasks/:id/usage` for one task's. The daemon's other fetch shapes are in daemon-api.ts.

/**
 * Both windows in one body (ADR 021): one scan of the transcripts answers the day and the week,
 * so the CLI and the workspace's usage bar make one call. `scannedAt` is when that scan ran.
 */
export type UsageResponse = {
  day: { window: UsageWindow; plans: PlanUsage[] };
  week: { window: UsageWindow; plans: PlanUsage[] };
  /** The ceilings from config.yaml over these same windows, from this same scan. */
  budget: BudgetReport;
  /**
   * What the harnesses last said about their plans' own meters, one row per harness with a local
   * source. Each window carries the `freshness` the figure had at `scannedAt`.
   */
  limits: PlanLimit[];
  /**
   * Every harness detection found installed whose registry row has a usage source, in registry
   * order, labelled with the plan `summarizePlans` uses. The bar and `agn usage` show each one,
   * tokens or not, so a window that counted nothing keeps its row (ADR 029, amended 2026-10-06).
   */
  present: PlanPresent[];
  /**
   * The harnesses agn detected on this machine whose registry row names no usage source, in
   * registry order. Nothing on the machine records their tokens, so the bar and `agn usage` name
   * them rather than leave them out (ADR 029, 2026-09-30). `present`'s complement over the same
   * installed set.
   */
  unavailable: HarnessId[];
  scannedAt: string;
};

/** One task's tokens. `billing` comes from the task's profile; null when it cannot be resolved. */
export type TaskUsageResponse = { task: Task; usage: UsageSum; billing: Billing | null };
