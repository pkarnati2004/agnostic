import type {
  BudgetReport,
  DoctorResponse,
  PlanLimit,
  PlanOption,
  PlanUsage,
  Task,
  TaskUsageResponse,
  UsageResponse,
  UsageSum,
} from "@agnostic/core";

// 2026-09-11 was a Friday; the week it is in starts on Monday the 7th - the CLI's own fixture dates.
const SCANNED_AT = "2026-09-11T15:00:00";

function usageSum(over: Partial<UsageSum> = {}): UsageSum {
  return {
    tokens: 1_234_567,
    tokensInput: 34_567,
    tokensOutput: 200_000,
    tokensCacheRead: 1_000_000,
    tokensCacheWrite: null,
    costUsd: null,
    ...over,
  };
}

export function claudePlan(over: Partial<PlanUsage> = {}): PlanUsage {
  return {
    harness: "claude-code",
    vendor: "claude",
    plan: "max20",
    usage: usageSum(),
    unattributedTokens: 1_700,
    fableShare: 0.25,
    apiRateUsd: 12.4,
    ...over,
  };
}

/** The catalog rows `POST /doctor` answers with, which is all the plan question ever offers. */
export function planOptions(): PlanOption[] {
  return [
    { vendor: "claude", id: "pro", displayName: "Pro" },
    { vendor: "claude", id: "max5", displayName: "Max 5x" },
    { vendor: "claude", id: "max20", displayName: "Max 20x" },
    { vendor: "chatgpt", id: "plus", displayName: "Plus" },
  ];
}

/** Only the fields the workspace reads: the rest of the report belongs to `agn doctor`. */
export function doctorResponse(over: Partial<DoctorResponse> = {}): DoctorResponse {
  return {
    harnesses: [],
    profiles: [],
    tools: [],
    detectedAt: new Date(SCANNED_AT).toISOString(),
    pathVar: "/usr/bin",
    plans: {},
    named: [],
    planOptions: planOptions(),
    tmuxConfigStale: false,
    ...over,
  };
}

const codexPlan: PlanUsage = {
  harness: "codex",
  vendor: "chatgpt",
  plan: null,
  usage: usageSum({ tokens: 88_000, costUsd: null }),
  unattributedTokens: 0,
  fableShare: null,
  apiRateUsd: 4.2,
};

const meteredPlan: PlanUsage = {
  harness: "opencode",
  vendor: null,
  plan: null,
  usage: usageSum({ tokens: 12_000, costUsd: 1.234 }),
  unattributedTokens: 0,
  fableShare: null,
  apiRateUsd: null,
};

/** The plan's own meter as `GET /usage` reports it, current against the fixture's scan time. */
export function claudeLimit(over: Partial<PlanLimit> = {}): PlanLimit {
  return {
    harness: "claude-code",
    vendor: "claude",
    fiveHour: {
      usedPercent: 58,
      resetsAt: new Date("2026-09-11T17:05:00").toISOString(),
      freshness: "current",
    },
    week: {
      usedPercent: 41,
      resetsAt: new Date("2026-09-14T09:00:00").toISOString(),
      freshness: "current",
    },
    observedAt: new Date("2026-09-11T14:50:00").toISOString(),
    source: "claude-statusline",
    ...over,
  };
}

export function usageResponse(
  day: PlanUsage[] = [claudePlan(), codexPlan, meteredPlan],
  week: PlanUsage[] = day,
  budget: BudgetReport = { day: null, week: null },
  limits: PlanLimit[] = [],
): UsageResponse {
  return {
    day: { window: bounds("day", "2026-09-11T00:00:00"), plans: day },
    week: { window: bounds("week", "2026-09-07T00:00:00"), plans: week },
    budget,
    limits,
    scannedAt: new Date(SCANNED_AT).toISOString(),
  };
}

/** Local midnight, as the daemon computes it, so the heading is the day the user is having. */
function bounds(kind: "day" | "week", local: string) {
  return { kind, since: new Date(local).toISOString(), until: new Date(SCANNED_AT).toISOString() };
}

const usageTask: Task = {
  id: "t3n9v2wxyz",
  repoId: "r7k2m4pqrs",
  title: "add a --verbose flag",
  prompt: "p",
  profileId: "claude-code:default:native",
  worktreePath: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/flag",
  status: "done",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T12:00:00.000Z",
};

export const subscriptionTaskUsage: TaskUsageResponse = {
  task: usageTask,
  usage: usageSum(),
  billing: "subscription",
};

export const meteredTaskUsage: TaskUsageResponse = {
  task: usageTask,
  usage: usageSum({ costUsd: 1.5 }),
  billing: "api-key",
};
