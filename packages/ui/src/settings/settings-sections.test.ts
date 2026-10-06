import { describe, expect, it } from "vitest";
import { filterSections, SETTINGS_SECTIONS } from "./settings-sections";

const ids = (query: string) => filterSections(query).map((section) => section.id);

describe("SETTINGS_SECTIONS", () => {
  it("lists this computer's settings before the app's, in the design's order", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.group)).toEqual([
      "This computer",
      "App",
      "App",
    ]);
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      "daemon",
      "appearance",
      "shortcuts",
    ]);
  });
});

describe("filterSections", () => {
  it("answers every section for an empty query", () => {
    expect(ids("")).toEqual(["daemon", "appearance", "shortcuts"]);
    expect(ids("   ")).toHaveLength(SETTINGS_SECTIONS.length);
  });

  it("keeps a section a term matches and drops the rest", () => {
    expect(ids("theme")).toEqual(["appearance"]);
    expect(ids("agnd")).toEqual(["daemon"]);
    expect(ids("keyboard")).toEqual(["shortcuts"]);
  });

  it("matches the label as well as the terms, case-insensitively", () => {
    expect(ids("APPEARANCE")).toEqual(["appearance"]);
    expect(ids("Daemon and terminal")).toEqual(["daemon"]);
  });

  it("answers nothing for a query no section has a word for", () => {
    expect(ids("sprocket")).toEqual([]);
  });
});
