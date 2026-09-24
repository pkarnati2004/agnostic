import type { Plan, PlanVendor } from "./plans.js";
import type { HarnessId } from "./profile.js";

/**
 * Tokens and cost over some set of usage rows. The buckets are null when nothing in the set
 * recorded them, which is not the same as zero: a harness that reports no cache buckets and one
 * that reports zero cache tokens are different facts about the row.
 */
export type UsageSum = {
  tokens: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  tokensCacheRead: number | null;
  tokensCacheWrite: number | null;
  costUsd: number | null;
};

/**
 * One line of a window's usage: the sums for a harness and model, attributed to a task or not.
 * The ledger produces these and the summary reads them, so the shape lives here.
 */
export type UsageBreakdown = UsageSum & {
  harness: HarnessId;
  model: string | null;
  attributed: boolean;
};

/** Half-open `[since, until)` in UTC; the boundaries are computed in the daemon's local zone. */
export type UsageWindow = { kind: "day" | "week"; since: string; until: string };

/** What one harness spent in a window, against the plan it is billed on. */
export type PlanUsage = {
  harness: HarnessId;
  /** null for a harness billed per provider key, which has no plan to spend against. */
  vendor: PlanVendor | null;
  /** Detected where the harness exposes it, else declared in config.yaml, else null. */
  plan: Plan | null;
  usage: UsageSum;
  /** Tokens from sessions agn did not start: the plan's meter counts them and agn cannot price them. */
  unattributedTokens: number;
  /** Claude only: tokens on a Fable model over all tokens, 0..1; null when nothing was counted. */
  fableShare: number | null;
};

/** Where a window's priced spend sits against its ceiling: ok, near it, or past it. */
export type BudgetState = "ok" | "warn" | "exceeded";

/** One window's ceiling against what agn priced in it. */
export type BudgetWindow = { limitUsd: number; spentUsd: number; state: BudgetState };

/** Null per window when config.yaml sets no limit for it. */
export type BudgetReport = { day: BudgetWindow | null; week: BudgetWindow | null };

/** One rolling window of a plan's rate limit, as the harness last reported it. */
export type LimitWindow = {
  /** 0..100, the share of the window the account has spent. */
  usedPercent: number;
  /** ISO, or null when the harness reported a percentage and no reset time. */
  resetsAt: string | null;
};

/**
 * What a harness said about the plan's own meter, read from a file this machine already has.
 * The figure is the account's, not the session's: a run outside agn moves it too.
 */
export type PlanLimit = {
  harness: HarnessId;
  vendor: PlanVendor | null;
  fiveHour: LimitWindow | null;
  week: LimitWindow | null;
  /** When the harness reported it: the record's timestamp (Codex), the file's mtime (Claude Code). */
  observedAt: string;
  source: "codex-rollout" | "claude-statusline";
};

/** Without a reset time, an observation is worth showing for this long and no longer. */
const LIMIT_TTL_MS = 60 * 60 * 1_000;

/**
 * A window is current while its reset is still ahead: the percentage cannot have fallen yet.
 * A window with no reset time is current for an hour after it was observed, which is short enough
 * that a figure the user has since spent past is not drawn as if it were now.
 */
export function limitIsCurrent(window: LimitWindow, observedAt: string, now: Date): boolean {
  if (window.resetsAt !== null) {
    return Date.parse(window.resetsAt) > now.getTime();
  }
  const observed = Date.parse(observedAt);
  return Number.isFinite(observed) && now.getTime() - observed < LIMIT_TTL_MS;
}
