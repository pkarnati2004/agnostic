import type { CatalogCheckState, CatalogSummary } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { catalogStaleLine } from "./catalog-stale";

const NOW = Date.parse("2026-09-24T10:00:00.000Z");

const TAIL = "Recommendations use the current data until you run `agn catalog update`.";

function summary(over: Partial<CatalogSummary> = {}): CatalogSummary {
  return {
    version: 2,
    generatedAt: "2026-09-08T00:00:00.000Z",
    origin: "downloaded",
    lastCheck: null,
    checkEnabled: true,
    ...over,
  };
}

function check(over: Partial<CatalogCheckState> = {}): CatalogCheckState {
  return {
    checkedAt: "2026-09-23T10:00:00.000Z",
    outcome: "current",
    localVersion: 2,
    remoteVersion: 2,
    message: null,
    ...over,
  };
}

describe("catalogStaleLine", () => {
  it("says nothing on a machine that opted out of the check", () => {
    expect(catalogStaleLine(summary({ checkEnabled: false }), NOW)).toBeNull();
    expect(catalogStaleLine(summary({ checkEnabled: false, lastCheck: check() }), NOW)).toBeNull();
  });

  it("says nothing while the last check is a few days old", () => {
    expect(catalogStaleLine(summary({ lastCheck: check() }), NOW)).toBeNull();
    const sixDays = check({ checkedAt: "2026-09-18T11:00:00.000Z" });
    expect(catalogStaleLine(summary({ lastCheck: sixDays }), NOW)).toBeNull();
  });

  it("counts the days once a week has gone by", () => {
    const old = check({ checkedAt: "2026-09-15T09:00:00.000Z" });
    expect(catalogStaleLine(summary({ lastCheck: old }), NOW)).toBe(
      `Catalog last checked 9 days ago. ${TAIL}`,
    );
  });

  it("reports a failed check whenever it happened, in the daemon's words", () => {
    const failed = check({
      outcome: "failed",
      message: "getaddrinfo ENOTFOUND",
      remoteVersion: null,
    });
    expect(catalogStaleLine(summary({ lastCheck: failed }), NOW)).toBe(
      `The last catalog check failed: getaddrinfo ENOTFOUND. ${TAIL}`,
    );
  });

  it("says so when no check has ever run", () => {
    expect(catalogStaleLine(summary(), NOW)).toBe(`The catalog has never been checked. ${TAIL}`);
  });
});
