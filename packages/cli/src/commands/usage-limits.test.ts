import type { PlanLimit } from "@agnostic/core";
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

  function limit(over: Partial<PlanLimit> = {}): PlanLimit {
    return {
      harness: "claude-code",
      vendor: "claude",
      fiveHour: { usedPercent: 58, resetsAt: "2026-09-11T14:05:00" },
      week: { usedPercent: 41, resetsAt: "2026-09-14T09:00:00" },
      observedAt: "2026-09-11T12:00:00.000Z",
      source: "claude-statusline",
      ...over,
    };
  }

  it("prints one line per harness, under the tables and over the budget", async () => {
    await withClock("2026-09-11T13:00:00", async () => {
      const test = cli({ usage: response([plan()], NO_BUDGET, [limit()]) });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe(
        "claude-code  58% of the 5-hour window (resets 14:05) · 41% of the week (resets Mon 09:00)",
      );
    });
  });

  it("leaves out a window whose reset has already passed", async () => {
    await withClock("2026-09-11T15:00:00", async () => {
      const test = cli({ usage: response([plan()], NO_BUDGET, [limit()]) });

      await parse(test.ctx, []);

      expect(test.out.at(-1)).toBe("claude-code  41% of the week (resets Mon 09:00)");
    });
  });

  it("prints nothing for a harness whose every window is stale", async () => {
    await withClock("2026-09-11T23:00:00", async () => {
      const test = cli({
        usage: response([plan()], NO_BUDGET, [limit({ fiveHour: null, week: null })]),
      });

      await parse(test.ctx, []);

      expect(test.out.join("\n")).not.toContain("% of");
    });
  });

  it("carries the limits through --json", async () => {
    const test = cli({ usage: response([plan()], NO_BUDGET, [limit()]) });
    test.ctx.json = true;

    await parse(test.ctx, []);

    expect(JSON.parse(test.out.join("\n")).limits).toHaveLength(1);
  });
});
