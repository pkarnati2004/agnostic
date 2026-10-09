import { describe, expect, it } from "vitest";
import {
  COLOR_MODES,
  DEFAULT_APPEARANCE,
  isColorMode,
  isThemeId,
  THEME_IDS,
} from "./appearance.js";

describe("isThemeId", () => {
  it("accepts the eight themes the page ships a stylesheet for", () => {
    expect(THEME_IDS.filter((id) => !isThemeId(id))).toEqual([]);
    expect(THEME_IDS).toHaveLength(8);
  });

  it("rejects a name no stylesheet answers to", () => {
    for (const value of ["Rosewood", "", "midnight", 7, null, undefined, {}]) {
      expect(isThemeId(value), String(value)).toBe(false);
    }
  });
});

describe("isColorMode", () => {
  it("accepts dark, light and system", () => {
    expect(COLOR_MODES.filter((mode) => !isColorMode(mode))).toEqual([]);
    expect([...COLOR_MODES]).toEqual(["dark", "light", "system"]);
  });

  it("rejects anything else", () => {
    for (const value of ["Dark", "auto", "", 0, null, []]) {
      expect(isColorMode(value), String(value)).toBe(false);
    }
  });
});

describe("DEFAULT_APPEARANCE", () => {
  it("is Rosewood following the system, which is what config.yaml means by saying nothing", () => {
    expect(DEFAULT_APPEARANCE).toEqual({ theme: "rosewood", mode: "system" });
    expect(isThemeId(DEFAULT_APPEARANCE.theme)).toBe(true);
  });
});
