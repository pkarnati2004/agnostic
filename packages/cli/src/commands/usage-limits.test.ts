import { NO_LIMIT_DETAIL, type PlanLimit } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { usageCommand } from "./usage.js";
import { cli, NO_BUDGET, plan, response } from "./usage-fixture.js";

function parse(ctx: ReturnType<typeof cli>["ctx"], args: string[]): Promise<unknown> {
  return usageCommand(ctx).parseAsync(args, { from: "user" });
}

describe("agn usage and the plan's own meter", () => {
  /** A fixed clock: the reset times below are read against the day the test pretends it is. */
  function withClock<T>(iso: string, body: () => Promise<T>): Promise<T> {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
    return body().finally(() => vi.useRealTimers());
  }

  /** Minutes before whatever the fake clock says, so the age reads the same in any time zone. */
  function observed(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }

  function limit(over: Partial<PlanLimit> = {}): PlanLimit {
    return {
      harness: "claude-code",
      vendor: "claude",
      fiveHour: { usedPercent: 58, resetsAt: "2026-09-11T14:05:00", freshness: "current" },
      week: { usedPercent: 41, resetsAt: "2026-09-14T09:00:00", freshness: "current" },
      observedAt: observed(12),
      source: "statusline",
      detail: NO_LIMIT_DETAIL,
      ...over,
    };
  }

  it("prints one line per harness, dated, under the tables and over the budget", async () => {
    await withClock("2026-09-11T13:00:00", async () => {
      const test = cli({ usage: response([plan()], NO_BUDGET, [limit()]) });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe(
        "claude-code  58% of the 5-hour window (resets 14:05) · 41% of the week (resets Mon 09:00) · as of 12 min ago",
      );
    });
  });

  it("prints the account's credits and plan under the window lines", async () => {
    await withClock("2026-09-11T13:00:00", async () => {
      const detail = { ...NO_LIMIT_DETAIL, credits: 12.5, planType: "plus" };
      const test = cli({
        usage: response([plan()], NO_BUDGET, [limit({ harness: "codex", detail })]),
      });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe("codex  credits $12.50 · plan plus");
    });
  });

  it("prints the session cost and context a status line reported", async () => {
    await withClock("2026-09-11T13:00:00", async () => {
      const detail = { ...NO_LIMIT_DETAIL, sessionCostUsd: 0.8412, contextUsedPercent: 37.4 };
      const test = cli({ usage: response([plan()], NO_BUDGET, [limit({ detail })]) });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe(
        "claude-code  last session $0.84 (the agent's figure) · context 37% used",
      );
    });
  });

  it("names every installed agent that records no usage, over the budget lines", async () => {
    await withClock("2026-09-11T13:00:00", async () => {
      const test = cli({ usage: response([plan()], NO_BUDGET, [], ["kimi", "droid"]) });

      await parse(test.ctx, []);

      expect(test.out.slice(-2)).toEqual([
        "usage not available for kimi: nothing on this machine records it",
        "usage not available for droid: nothing on this machine records it",
      ]);
    });
  });

  it("marks every window of a figure the account has had two hours to move", async () => {
    await withClock("2026-09-11T13:00:00", async () => {
      const test = cli({
        usage: response([plan()], NO_BUDGET, [limit({ observedAt: observed(3 * 60) })]),
      });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe(
        "claude-code  ~58% of the 5-hour window (resets 14:05) · ~41% of the week (resets Mon 09:00) · as of 3 h ago",
      );
    });
  });

  it("leaves out a window whose reset has already passed and keeps the other", async () => {
    await withClock("2026-09-11T15:00:00", async () => {
      const test = cli({ usage: response([plan()], NO_BUDGET, [limit()]) });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe(
        "claude-code  41% of the week (resets Mon 09:00) · as of 12 min ago",
      );
    });
  });

  it("prints nothing for a harness whose every window is stale", async () => {
    await withClock("2026-09-11T23:00:00", async () => {
      const test = cli({
        usage: response([plan()], NO_BUDGET, [limit({ fiveHour: null, week: null })]),
      });

      await parse(test.ctx, []);

      expect(test.out.join("\n")).not.toContain("% of");
      expect(test.out.join("\n")).not.toContain("as of");
    });
  });

  it("carries the limits and the API-rate figure through --json", async () => {
    const test = cli({ usage: response([plan()], NO_BUDGET, [limit()]) });
    test.ctx.json = true;

    await parse(test.ctx, []);

    const body = JSON.parse(test.out.join("\n"));
    expect(body.limits).toHaveLength(1);
    expect(body.limits[0].fiveHour.freshness).toBe("current");
    expect(body.day.plans[0].apiRateUsd).toBe(12.4);
  });
});
