import { z } from "zod";
import { type Plan, type Plans, PlansSchema, type PlanVendor } from "./plans.js";
import type { Billing, HarnessId, Profile } from "./profile.js";

export type ModelSource = "probe" | "seed" | "none";

/**
 * What agn knows about a harness's plan. `known` is false for a plan the catalog has no row for,
 * which agn shows as it was read rather than guessing what it includes. `confirmed` is false when
 * nothing but `config.yaml` says so and the models the harness lists belong to another plan.
 */
export type PlanReport = {
  value: Plan;
  source: "detected" | "config";
  known: boolean;
  confirmed: boolean;
};

/** A plan the catalog knows, which is what `agn doctor` offers and the workspace picker lists. */
export type PlanOption = { vendor: PlanVendor; id: Plan; displayName: string };

/** A registry `HarnessStatus` flattened for the wire; tier 2 and uninstalled rows carry `[]`. */
export type HarnessReport = {
  harness: HarnessId;
  name: string;
  binary: string;
  path: string | null;
  version: string | null;
  login: "logged-in" | "logged-out" | "unknown";
  billing: Billing;
  tier: 1 | 2;
  models: string[];
  modelSource: ModelSource;
  /** null for a harness billed per provider key, which has no plan to be on. */
  planVendor: PlanVendor | null;
  /** null when nothing said which plan: not logged in, no plan source, no config entry. */
  plan: PlanReport | null;
};

/** A tool that is not a harness but that agn reports on: `gh` is the only one in v0. */
export type ToolReport = {
  tool: "gh";
  path: string | null;
  version: string | null;
  login: "logged-in" | "logged-out" | "unknown";
};

// An absent or empty body is legal: `agn doctor` with no flag changes nothing and re-detects.
export const DoctorRequestSchema = z.strictObject({ plans: PlansSchema.optional() });
export type DoctorRequest = z.infer<typeof DoctorRequestSchema>;

export type DoctorResponse = {
  harnesses: HarnessReport[];
  profiles: Profile[];
  tools: ToolReport[];
  detectedAt: string;
  /** The PATH the daemon was started with, because that is what detection saw.  */
  pathVar: string;
  /** config.yaml's plans after this call, so a client can show what it just wrote. */
  plans: Plans;
  /** Every plan the catalog knows, for the prompt and the picker; agn offers nothing else. */
  planOptions: PlanOption[];
  /**
   * True when a tmux server of agn's has been running since before the current settings were
   * written, so its panes still run on the old ones. False when no server is running.
   */
  tmuxConfigStale: boolean;
};
