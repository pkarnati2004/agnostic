import { describe, expect, it } from "vitest";
import { filterSections, needsDoctor, SETTINGS_SECTIONS } from "./settings-sections";

const ids = (query: string) => filterSections(query).map((section) => section.id);

const ORDER = ["agents", "plans", "recommendations", "tasks", "daemon", "appearance", "shortcuts"];

describe("SETTINGS_SECTIONS", () => {
  it("lists seven sections under four headings, in the design's order", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.group)).toEqual([
      "Agents",
      "Agents",
      "Agents",
      "Work",
      "This computer",
      "App",
      "App",
    ]);
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual(ORDER);
  });
});

describe("needsDoctor", () => {
  it("names the three sections that read a detection", () => {
    expect(SETTINGS_SECTIONS.filter((section) => needsDoctor(section.id)).map((s) => s.id)).toEqual(
      ["agents", "plans", "daemon"],
    );
  });
});

describe("filterSections", () => {
  it("answers every section for an empty query", () => {
    expect(ids("")).toEqual(ORDER);
    expect(ids("   ")).toHaveLength(SETTINGS_SECTIONS.length);
  });

  it("keeps a section a term matches and drops the rest", () => {
    expect(ids("theme")).toEqual(["appearance"]);
    expect(ids("agnd")).toEqual(["daemon"]);
    expect(ids("keyboard")).toEqual(["shortcuts"]);
    expect(ids("api key")).toEqual(["plans"]);
    expect(ids("worktree")).toEqual(["tasks"]);
  });

  it("keeps the two sections a word belongs to both of", () => {
    expect(ids("tmux")).toEqual(["daemon"]);
    expect(ids("spec")).toEqual(["agents", "tasks"]);
  });

  it("matches the label as well as the terms, case-insensitively", () => {
    expect(ids("APPEARANCE")).toEqual(["appearance"]);
    expect(ids("Daemon and terminal")).toEqual(["daemon"]);
  });

  it("answers nothing for a query no section has a word for", () => {
    expect(ids("sprocket")).toEqual([]);
  });
});
