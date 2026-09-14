import type { PlanUsage, Task, TaskUsageResponse, UsageResponse, UsageSum } from "@agnostic/core";

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
};

const meteredPlan: PlanUsage = {
  harness: "opencode",
  vendor: null,
  plan: null,
  usage: usageSum({ tokens: 12_000, costUsd: 1.234 }),
  unattributedTokens: 0,
  fableShare: null,
};

export function usageResponse(
  day: PlanUsage[] = [claudePlan(), codexPlan, meteredPlan],
  week: PlanUsage[] = day,
): UsageResponse {
  return {
    day: { window: bounds("day", "2026-09-11T00:00:00"), plans: day },
    week: { window: bounds("week", "2026-09-07T00:00:00"), plans: week },
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
