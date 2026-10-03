import { describe, expect, it } from "vitest";
import { formatElapsed } from "./elapsed";

const NOW = Date.parse("2026-09-14T12:00:00.000Z");

describe("formatElapsed", () => {
  it("counts in minutes, then hours, then days", () => {
    expect(formatElapsed("2026-09-14T11:56:00.000Z", NOW)).toBe("4m");
    expect(formatElapsed("2026-09-14T10:48:00.000Z", NOW)).toBe("1h 12m");
    expect(formatElapsed("2026-09-12T08:55:00.000Z", NOW)).toBe("2d 3h");
  });

  it("reads anything under a minute, and any clock skew, as 0m", () => {
    expect(formatElapsed("2026-09-14T11:59:30.000Z", NOW)).toBe("0m");
    expect(formatElapsed("2026-09-14T12:00:10.000Z", NOW)).toBe("0m");
  });

  it("rolls over at each unit's boundary rather than rounding up early", () => {
    expect(formatElapsed("2026-09-14T11:59:01.000Z", NOW)).toBe("0m"); // 59s
    expect(formatElapsed("2026-09-14T11:59:00.000Z", NOW)).toBe("1m"); // 60s
    expect(formatElapsed("2026-09-14T11:01:00.000Z", NOW)).toBe("59m"); // 59min
    expect(formatElapsed("2026-09-14T11:00:00.000Z", NOW)).toBe("1h 0m"); // 60min
    expect(formatElapsed("2026-09-13T11:00:00.000Z", NOW)).toBe("1d 1h"); // 25h
  });
});
