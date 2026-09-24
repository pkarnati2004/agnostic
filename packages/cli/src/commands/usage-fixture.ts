// The stubbed daemon and the rows the two `agn usage` test files share.
import {
  agnosticPaths,
  type BudgetReport,
  type PlanLimit,
  type PlanUsage,
  type Task,
  type TaskUsageResponse,
  type UsageResponse,
  type UsageSum,
} from "@agnostic/core";
import { createTestContext } from "../test-context.js";

const PATHS = agnosticPaths("/home/.agnostic");

export const NO_BUDGET: BudgetReport = { day: null, week: null };

export const task: Task = {
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

export function sum(over: Partial<UsageSum> = {}): UsageSum {
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

export function plan(over: Partial<PlanUsage> = {}): PlanUsage {
  return {
    harness: "claude-code",
    vendor: "claude",
    plan: "max20",
    usage: sum(),
    unattributedTokens: 0,
    fableShare: 0.42,
    ...over,
  };
}

export function response(
  plans: PlanUsage[],
  budget: BudgetReport = NO_BUDGET,
  limits: PlanLimit[] = [],
): UsageResponse {
  return {
    // 2026-09-11 was a Friday; the week it is in starts on Monday the 7th.
    day: { window: dayWindow("day", "2026-09-11T00:00:00"), plans },
    week: { window: dayWindow("week", "2026-09-07T00:00:00"), plans },
    budget,
    limits,
    scannedAt: "2026-09-11T15:00:00.000Z",
  };
}

/** Local midnight, as the daemon computes it, so the CLI prints the day the user is having. */
function dayWindow(kind: "day" | "week", local: string) {
  return {
    kind,
    since: new Date(local).toISOString(),
    until: new Date("2026-09-11T15:00:00").toISOString(),
  };
}

export function cli(
  opts: { usage?: UsageResponse; taskUsage?: TaskUsageResponse; cwd?: string } = {},
) {
  return createTestContext({
    cwd: opts.cwd ?? "/work/api",
    paths: PATHS,
    client: {
      usage: () => Promise.resolve(opts.usage ?? response([])),
      taskUsage: () =>
        Promise.resolve(opts.taskUsage ?? { task, usage: sum(), billing: "subscription" }),
    },
  });
}
