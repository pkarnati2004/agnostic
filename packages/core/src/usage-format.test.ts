import { describe, expect, it } from "vitest";
import type { UsageWindow } from "./usage.js";
import { formatAgo, formatReset, formatTokens3, windowHeading } from "./usage-format.js";

describe("formatAgo", () => {
  const now = new Date("2026-09-11T13:00:00.000Z");
  const ago = (minutes: number) =>
    formatAgo(new Date(now.getTime() - minutes * 60_000).toISOString(), now);

  it("says just now under a minute", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(1)).toBe("1 min ago");
  });

  it("counts minutes up to the hour", () => {
    expect(ago(59)).toBe("59 min ago");
    expect(ago(60)).toBe("1 h ago");
  });

  it("counts hours up to the day", () => {
    expect(ago(23 * 60 + 59)).toBe("23 h ago");
    expect(ago(24 * 60)).toBe("1 d ago");
  });

  it("says just now for a time it cannot read", () => {
    expect(formatAgo("not a time", now)).toBe("just now");
  });
});

describe("formatTokens3", () => {
  it("prints a count under a thousand as it is", () => {
    expect(formatTokens3(999)).toBe("999");
    expect(formatTokens3(0)).toBe("0");
  });

  it("rounds to three significant figures and drops the zeros", () => {
    expect(formatTokens3(1_000)).toBe("1k");
    expect(formatTokens3(1_234)).toBe("1.23k");
    expect(formatTokens3(12_100_000)).toBe("12.1M");
    expect(formatTokens3(273_900_000)).toBe("274M");
  });

  it("moves up a scale rather than printing a fourth figure", () => {
    expect(formatTokens3(999_999)).toBe("1M");
    expect(formatTokens3(1_200_000_000)).toBe("1.2B");
  });

  it("shows a bucket nothing reported as a dash", () => {
    expect(formatTokens3(null)).toBe("-");
  });
});

describe("formatReset", () => {
  const now = new Date("2026-09-11T13:00:00");

  it("gives the clock time alone while the reset is today", () => {
    expect(formatReset(new Date("2026-09-11T14:05:00").toISOString(), now)).toBe("14:05");
  });

  it("names the weekday once the reset is another day", () => {
    expect(formatReset(new Date("2026-09-14T09:00:00").toISOString(), now)).toBe("Mon 09:00");
  });
});

// The daemon computes the boundaries in its own zone, so the fixtures are written as local times.
describe("windowHeading", () => {
  it("heads the day with the date the daemon computed it in", () => {
    expect(windowHeading(window("day", "2026-09-11T00:00:00"))).toBe("2026-09-11");
  });

  it("heads the week with the weekday it starts on", () => {
    expect(windowHeading(window("week", "2026-09-07T00:00:00"))).toBe("from Mon 2026-09-07");
  });
});

function window(kind: UsageWindow["kind"], since: string): UsageWindow {
  return {
    kind,
    since: new Date(since).toISOString(),
    until: new Date("2026-09-11T13:00:00").toISOString(),
  };
}
