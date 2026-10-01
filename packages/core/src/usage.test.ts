import { describe, expect, it } from "vitest";
import { limitFreshness } from "./usage.js";

const NOW = new Date("2026-09-24T12:00:00.000Z");

/** `observedAt` as a number of minutes before `NOW`. */
function observed(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("limitFreshness", () => {
  const ahead = { usedPercent: 58, resetsAt: "2026-09-24T14:05:00.000Z" };
  const noReset = { usedPercent: 41, resetsAt: null };

  it("calls a figure under two hours old current while its reset is ahead", () => {
    expect(limitFreshness(ahead, observed(119), NOW)).toBe("current");
  });

  it("calls it approximate at two hours old", () => {
    expect(limitFreshness(ahead, observed(120), NOW)).toBe("approximate");
  });

  it("keeps a figure approximate while the window still has days to run", () => {
    const week = { usedPercent: 17, resetsAt: "2026-09-29T12:00:00.000Z" };

    expect(limitFreshness(week, observed(3 * 24 * 60), NOW)).toBe("approximate");
  });

  it("calls it stale once the reset has passed", () => {
    expect(limitFreshness({ ...ahead, resetsAt: NOW.toISOString() }, observed(10), NOW)).toBe(
      "stale",
    );
  });

  it("keeps a window with no reset time current for an hour after it was observed", () => {
    expect(limitFreshness(noReset, observed(59), NOW)).toBe("current");
  });

  it("drops a window with no reset time once the hour is up", () => {
    expect(limitFreshness(noReset, observed(60), NOW)).toBe("stale");
  });

  it("drops a window whose observation time cannot be read", () => {
    expect(limitFreshness(ahead, "not a time", NOW)).toBe("stale");
  });
});
