import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseStatusLinePayload } from "./statusline.js";

const FIXTURE = fileURLToPath(
  new URL("../../../../tests/fixtures/usage/claude-statusline.json", import.meta.url),
);

const OBSERVED_AT = "2026-09-24T12:00:00.000Z";

const payload = (rateLimits: object) => JSON.stringify({ session_id: "s-1", ...rateLimits });

describe("parseStatusLinePayload", () => {
  it("reads both windows out of the payload Claude Code pipes to the status line", async () => {
    const limit = parseStatusLinePayload(await readFile(FIXTURE, "utf8"), OBSERVED_AT);

    expect(limit).toEqual({
      harness: "claude-code",
      fiveHour: { usedPercent: 58, resetsAt: "2026-09-24T14:05:00.000Z" },
      week: { usedPercent: 41, resetsAt: "2026-09-28T09:00:00.000Z" },
      observedAt: OBSERVED_AT,
      source: "statusline",
    });
  });

  it("takes utilization where the payload has no used_percentage", () => {
    const text = payload({ rate_limits: { five_hour: { utilization: 12 } } });

    expect(parseStatusLinePayload(text, OBSERVED_AT)).toMatchObject({
      fiveHour: { usedPercent: 12, resetsAt: null },
      week: null,
    });
  });

  it("reads a resets_at that has drifted to an ISO string", () => {
    const text = payload({
      rate_limits: { seven_day: { used_percentage: 3, resets_at: "2026-09-28T09:00:00Z" } },
    });

    expect(parseStatusLinePayload(text, OBSERVED_AT)).toMatchObject({
      week: { usedPercent: 3, resetsAt: "2026-09-28T09:00:00.000Z" },
    });
  });

  it("reports nothing for a session that carries no rate limits", () => {
    expect(parseStatusLinePayload(payload({}), OBSERVED_AT)).toBeNull();
  });

  it("reports nothing for a window with neither percentage field", () => {
    const text = payload({ rate_limits: { five_hour: { resets_at: 1790258700 } } });

    expect(parseStatusLinePayload(text, OBSERVED_AT)).toBeNull();
  });

  it("reports nothing for a half-written file", () => {
    expect(parseStatusLinePayload('{"rate_limits":', OBSERVED_AT)).toBeNull();
  });
});
