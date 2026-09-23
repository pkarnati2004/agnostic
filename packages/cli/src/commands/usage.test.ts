import {
  agnosticPaths,
  type BudgetReport,
  type PlanUsage,
  type Task,
  type TaskUsageResponse,
  type UsageResponse,
  type UsageSum,
} from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { createTestContext } from "../test-context.js";
import { usageCommand } from "./usage.js";

const PATHS = agnosticPaths("/home/.agnostic");

const NO_BUDGET: BudgetReport = { day: null, week: null };

const task: Task = {
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

function sum(over: Partial<UsageSum> = {}): UsageSum {
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

function plan(over: Partial<PlanUsage> = {}): PlanUsage {
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

function response(plans: PlanUsage[], budget: BudgetReport = NO_BUDGET): UsageResponse {
  return {
    // 2026-09-11 was a Friday; the week it is in starts on Monday the 7th.
    day: { window: dayWindow("day", "2026-09-11T00:00:00"), plans },
    week: { window: dayWindow("week", "2026-09-07T00:00:00"), plans },
    budget,
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

function cli(opts: { usage?: UsageResponse; taskUsage?: TaskUsageResponse; cwd?: string } = {}) {
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

function parse(ctx: ReturnType<typeof cli>["ctx"], args: string[]): Promise<unknown> {
  return usageCommand(ctx).parseAsync(args, { from: "user" });
}

describe("agn usage", () => {
  it("prints a table per window, headed with the days they cover", async () => {
    const test = cli({ usage: response([plan()]) });

    await parse(test.ctx, []);

    expect(test.out[0]).toBe("today (2026-09-11)");
    expect(test.out[1]).toBe(
      "plan          agent        tokens     input   output   cache read  cache write  cost  fable",
    );
    expect(test.out[2]).toBe(
      "claude max20  claude-code  1,234,567  34,567  200,000   1,000,000            -     -    42%",
    );
    expect(test.out[3]).toBe("");
    expect(test.out[4]).toBe("this week (from Mon 2026-09-07)");
  });

  it("says a window is empty rather than printing an empty table", async () => {
    const test = cli();

    await parse(test.ctx, []);

    expect(test.out).toEqual([
      "today (2026-09-11)",
      "no usage today",
      "",
      "this week (from Mon 2026-09-07)",
      "no usage this week",
    ]);
  });

  it("labels a row whose plan agn does not know", async () => {
    const test = cli({ usage: response([plan({ plan: null, fableShare: null })]) });

    await parse(test.ctx, []);

    expect(test.out[2]).toContain("unknown plan");
    expect(test.out[2]?.endsWith("-")).toBe(true);
  });

  it("prints the cost of a metered plan", async () => {
    const test = cli({
      usage: response([plan({ usage: sum({ costUsd: 1.234 }), vendor: null, plan: "team" })]),
    });

    await parse(test.ctx, []);

    expect(test.out[2]).toContain("$1.23");
  });

  it("prints the budget under the tables, with the state of each window", async () => {
    const test = cli({
      usage: response([], {
        day: { limitUsd: 5, spentUsd: 4.1, state: "warn" },
        week: { limitUsd: 20, spentUsd: 20.8, state: "exceeded" },
      }),
    });

    await parse(test.ctx, []);

    expect(test.out.slice(-3)).toEqual([
      "",
      "budget today $4.10 of $5.00 (82%, warn)",
      "budget this week $20.80 of $20.00 (104%, over)",
    ]);
  });

  it("prints only the week's line for a weekly-only ceiling, with no daily line above it", async () => {
    const test = cli({
      usage: response([], { day: null, week: { limitUsd: 20, spentUsd: 18.4, state: "warn" } }),
    });

    await parse(test.ctx, []);

    expect(test.out.slice(-2)).toEqual(["", "budget this week $18.40 of $20.00 (92%, warn)"]);
  });

  it("prints a window that is within its ceiling, and nothing when there is none", async () => {
    const set = cli({
      usage: response([], { day: { limitUsd: 5, spentUsd: 0.6, state: "ok" }, week: null }),
    });
    await parse(set.ctx, []);
    expect(set.out.at(-1)).toBe("budget today $0.60 of $5.00 (12%, ok)");

    const none = cli();
    await parse(none.ctx, []);
    expect(none.out.join("\n")).not.toContain("budget");
  });

  it("prints the response as it came when asked for JSON", async () => {
    const body = response([plan()]);
    const test = cli({ usage: body });
    test.ctx.json = true;

    await parse(test.ctx, []);

    expect(JSON.parse(test.out.join("\n"))).toEqual(body);
  });
});

describe("agn usage <task>", () => {
  it("prints one task's tokens, and says a subscription covered them", async () => {
    const test = cli();

    await parse(test.ctx, [task.id]);

    expect(test.out).toEqual([
      "id:          t3n9v2wxyz",
      "title:       add a --verbose flag",
      "profile:     claude-code:default:native",
      "tokens:      1,234,567",
      "input:       34,567",
      "output:      200,000",
      "cache read:  1,000,000",
      "cache write: -",
      "cost:        included in plan",
    ]);
  });

  it("prints what a metered task cost", async () => {
    const test = cli({
      taskUsage: { task, usage: sum({ costUsd: 2.5 }), billing: "api-key" },
    });

    await parse(test.ctx, [task.id]);

    expect(test.out).toContain("cost:        $2.50");
  });

  it("says so when a task has no usage recorded", async () => {
    const test = cli({ taskUsage: { task, usage: sum({ tokens: 0 }), billing: null } });

    await parse(test.ctx, [task.id]);

    expect(test.out).toEqual([`no usage recorded for ${task.id}`]);
    expect(test.ctx.exitCode).toBe(0);
  });

  it("defaults to the task of the worktree it is run in", async () => {
    const test = cli({ cwd: "/home/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz" });

    await parse(test.ctx, []);

    expect(test.out[0]).toBe("id:          t3n9v2wxyz");
  });
});
