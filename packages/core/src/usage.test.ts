import { describe, expect, it } from "vitest";
import { limitIsCurrent } from "./usage.js";

const NOW = new Date("2026-09-24T12:00:00.000Z");

describe("limitIsCurrent", () => {
  it("holds while the window's reset is still ahead", () => {
    const window = { usedPercent: 58, resetsAt: "2026-09-24T14:05:00.000Z" };

    expect(limitIsCurrent(window, "2026-09-24T09:00:00.000Z", NOW)).toBe(true);
  });

  it("drops the window once its reset has passed", () => {
    const window = { usedPercent: 58, resetsAt: "2026-09-24T11:59:59.000Z" };

    expect(limitIsCurrent(window, "2026-09-24T09:00:00.000Z", NOW)).toBe(false);
  });

  it("keeps a window with no reset time for an hour after it was observed", () => {
    const window = { usedPercent: 41, resetsAt: null };

    expect(limitIsCurrent(window, "2026-09-24T11:30:00.000Z", NOW)).toBe(true);
  });

  it("drops a window with no reset time once the hour is up", () => {
    const window = { usedPercent: 41, resetsAt: null };

    expect(limitIsCurrent(window, "2026-09-24T10:30:00.000Z", NOW)).toBe(false);
  });

  it("drops a window whose observation time cannot be read", () => {
    const window = { usedPercent: 41, resetsAt: null };

    expect(limitIsCurrent(window, "not a time", NOW)).toBe(false);
  });
});
