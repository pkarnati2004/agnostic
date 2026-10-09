import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG_STALE_DAYS } from "./config-defaults.js";

describe("DEFAULT_CATALOG_STALE_DAYS", () => {
  it("is the week the catalog notice waited before this key existed", () => {
    expect(DEFAULT_CATALOG_STALE_DAYS).toBe(7);
  });
});
