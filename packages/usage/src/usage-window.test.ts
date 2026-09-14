import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usageWindow } from "./usage-window.js";

/** Local time, because that is what the user means by today: 03:00 on a Friday. */
const early = new Date(2026, 8, 11, 3, 0, 0);

function localMidnight(year: number, month: number, day: number): string {
  return new Date(year, month, day).toISOString();
}

describe("usageWindow", () => {
  // Pinned so "local, not UTC" is actually exercised: on a CI runner set to UTC, local midnight
  // and UTC midnight coincide and a bug that used UTC boundaries would pass unnoticed.
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    process.env.TZ = original;
  });

  it("starts the day at local midnight, not at UTC midnight", () => {
    expect(usageWindow("day", early)).toEqual({
      kind: "day",
      since: localMidnight(2026, 8, 11),
      until: early.toISOString(),
    });
  });

  it("starts the week on Monday", () => {
    expect(usageWindow("week", early)).toEqual({
      kind: "week",
      since: localMidnight(2026, 8, 7),
      until: early.toISOString(),
    });
  });

  it("treats Sunday as the last day of the week it is in", () => {
    const sunday = new Date(2026, 8, 13, 23, 59, 0);

    expect(usageWindow("week", sunday).since).toBe(localMidnight(2026, 8, 7));
  });

  it("starts a new week on Monday morning", () => {
    const monday = new Date(2026, 8, 14, 0, 30, 0);

    expect(usageWindow("week", monday).since).toBe(localMidnight(2026, 8, 14));
  });

  it("does not answer with UTC midnight, in a zone where the two differ", () => {
    expect(usageWindow("day", early).since).not.toBe("2026-09-11T00:00:00.000Z");
  });
});
