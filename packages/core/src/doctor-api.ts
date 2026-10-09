import { z } from "zod";
import { type Plan, type Plans, PlansSchema, type PlanVendor } from "./plans.js";
import type { Billing, Profile } from "./profile.js";
import type { HarnessId } from "./profile-id.js";
import type { LimitSource } from "./usage.js";

export type ModelSource = "probe" | "seed" | "none";

/**
 * Which of a harness's sessions feed the plan's limit figure. `all-sessions` is every session on
 * the machine, `agn-tasks` only the ones agn started, and `none` no source at all.
 */
export type LimitCapture = "all-sessions" | "agn-tasks" | "none";

/**
 * What agn can do with a harness. `full` is hooks and a usage parser; `status` is hooks alone, so
 * the task's status is live but its tokens are not counted; `basic` is launch and attach.
 */
export type Support = "full" | "status" | "basic";

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
  /** The name the harness reported, when config.yaml overrode it because the catalog has no
   * row for it (ADR 016, amended); null otherwise. */
  overridden: Plan | null;
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
  /** What doctor prints. Tier says how much detection does; support says what the user gets. */
  support: Support;
  models: string[];
  modelSource: ModelSource;
  /** null for a harness billed per provider key, which has no plan to be on. */
  planVendor: PlanVendor | null;
  /** Where the harness's own rate-limit figure comes from; null for one that reports none. */
  limitSource: LimitSource | null;
  /** Where its token counts come from: files it writes, its hook payload, or nowhere. */
  usageSource: "transcripts" | "hook" | null;
  /** null when nothing said which plan: not logged in, no plan source, no config entry. */
  plan: PlanReport | null;
  /** `none` for every harness that reports no rate limit agn can read on this machine. */
  limitCapture: LimitCapture;
};

/** A tool that is not a harness but that agn reports on: `gh` is the only one in v0. */
export type ToolReport = {
  tool: "gh";
  path: string | null;
  version: string | null;
  login: "logged-in" | "logged-out" | "unknown";
};

/**
 * One environment variable a harness row or a gateway row names. `set` is presence and nothing
 * else: the value never leaves the daemon, so no client can print or log a key by accident.
 */
export type ApiKeyReport = { name: string; set: boolean; usedBy: HarnessId[] };

/** `version` is null when `tmux -V` fails; `ok` is 3.3 or newer, or a `next`/`master` build. */
export type TmuxReport = { version: string | null; ok: boolean };

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
  /**
   * The harnesses the user has named: config.yaml's spec writer and every task's profile. Doctor
   * keeps their row even when the binary is missing, and lists the rest on one line instead.
   */
  named: HarnessId[];
  /** Every plan the catalog knows, for the prompt and the picker; agn offers nothing else. */
  planOptions: PlanOption[];
  /**
   * True when a tmux server of agn's has been running since before the current settings were
   * written, so its panes still run on the old ones. False when no server is running.
   */
  tmuxConfigStale: boolean;
  /** Every key variable the registry names, as presence over the environment agnd was started in. */
  keys: ApiKeyReport[];
  /** What `tmux -V` on the daemon's PATH answered, for the row that says reattach needs 3.3. */
  tmux: TmuxReport;
};
