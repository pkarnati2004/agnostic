import type { Plan, PlanVendor } from "./plans.js";
import type { HarnessId } from "./profile-id.js";

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
  /**
   * What these tokens would cost at the catalog's API rates, for a plan that does not bill by
   * them. Null for a metered plan, which has a real cost, and when any row cannot be priced.
   */
  apiRateUsd: number | null;
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

/** How much a figure is still worth: as reported, old enough to be read as a rough value, or gone. */
export type LimitFreshness = "current" | "approximate" | "stale";

/** A window as `GET /usage` reports it: the harness's figure plus its state at `scannedAt`. */
export type LimitWindowReport = LimitWindow & { freshness: LimitFreshness };

/**
 * What a harness said about the plan's own meter, read from a file this machine already has.
 * The figure is the account's, not the session's: a run outside agn moves it too.
 */
/**
 * Where a harness's own figure for its plan comes from: a record in the transcript it rolls out, or
 * the payload its status line hands agn's script. A harness's registry row names which it has.
 */
export type LimitSource = "rollout" | "statusline";

export type PlanLimit = {
  harness: HarnessId;
  vendor: PlanVendor | null;
  fiveHour: LimitWindowReport | null;
  week: LimitWindowReport | null;
  /** When the harness reported it: the record's timestamp, or the mtime of the file agn's hook wrote. */
  observedAt: string;
  source: LimitSource;
};

/** Without a reset time, an observation is worth showing for this long and no longer. */
const LIMIT_TTL_MS = 60 * 60 * 1_000;

/** Past this, the account has had time to spend against the window without agn hearing about it. */
const APPROXIMATE_AFTER_MS = 2 * 60 * 60 * 1_000;

/**
 * current: the reset is ahead (or none is known and the observation is under 60 min old) and the
 * observation is under 2 h old. approximate: the reset is ahead and the observation is 2 h old or
 * more. stale: the reset has passed, or no reset is known and the observation is 60 min old or
 * more. Anything that acts on a figure acts on `current` only.
 */
export function limitFreshness(window: LimitWindow, observedAt: string, now: Date): LimitFreshness {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) {
    return "stale";
  }
  const age = now.getTime() - observed;
  if (window.resetsAt === null) {
    return age < LIMIT_TTL_MS ? "current" : "stale";
  }
  if (Date.parse(window.resetsAt) <= now.getTime()) {
    return "stale";
  }
  return age < APPROXIMATE_AFTER_MS ? "current" : "approximate";
}
