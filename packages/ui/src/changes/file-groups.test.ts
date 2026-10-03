import { describe, expect, it } from "vitest";
import { FILES, MIXED_FILES } from "./changes-fixture";
import { fileGroups, showGroupHeadings } from "./file-groups";

describe("fileGroups", () => {
  it("draws one group per state the list holds, in wire order", () => {
    const groups = fileGroups(MIXED_FILES);
    expect(groups.map((group) => [group.label, group.files.length])).toEqual([
      ["Unstaged", 2],
      ["Staged", 1],
      ["Committed", 2],
    ]);
    expect(groups[0]?.files.map((file) => file.path)).toEqual(["src/invite.ts", "docs/invites.md"]);
    expect(showGroupHeadings(groups)).toBe(true);
  });

  it("leaves out the groups with nothing in them", () => {
    const groups = fileGroups(FILES);
    expect(groups.map((group) => group.state)).toEqual(["unstaged"]);
    expect(showGroupHeadings(groups)).toBe(true);
  });

  it("asks for no heading when every row is committed", () => {
    const committed = FILES.map((file) => ({ ...file, state: "committed" as const }));
    const groups = fileGroups(committed);
    expect(groups.map((group) => [group.label, group.files.length])).toEqual([["Committed", 3]]);
    expect(showGroupHeadings(groups)).toBe(false);
  });

  it("has no group at all for an empty list", () => {
    expect(fileGroups([])).toEqual([]);
    expect(showGroupHeadings([])).toBe(false);
  });

  it("heads Staged then Committed, with no Unstaged heading, when nothing is unstaged", () => {
    const staged = MIXED_FILES.filter((file) => file.state !== "unstaged");
    const groups = fileGroups(staged);
    expect(groups.map((group) => group.label)).toEqual(["Staged", "Committed"]);
    expect(showGroupHeadings(groups)).toBe(true);
  });
});
