import { describe, expect, it } from "vitest";
import { filterCommands, moveSelection } from "./filter-commands";
import type { PaletteCommand } from "./palette-command";

function command(id: string, label: string, fromQuery = false): PaletteCommand {
  return {
    id,
    label,
    hint: null,
    fromQuery,
    group: fromQuery ? "query" : "commands",
    icon: null,
    profileId: null,
    run: () => undefined,
  };
}

const COMMANDS: PaletteCommand[] = [
  command("new-task", "New task"),
  command("run", "Run: sto", true),
  command("stop", "Stop Add the invite links"),
  command("resume", "Resume Add the invite links"),
  command("cost", "Cost"),
];

function ids(query: string): string[] {
  return filterCommands(COMMANDS, query).map((found) => found.id);
}

describe("filterCommands", () => {
  it("keeps every row while nothing has been typed", () => {
    expect(ids("")).toEqual(["new-task", "run", "stop", "resume", "cost"]);
    expect(ids("  ")).toEqual(["new-task", "run", "stop", "resume", "cost"]);
  });

  it("matches a substring of the label and nothing else", () => {
    expect(ids("sto")).toEqual(["stop", "run"]);
  });

  it("ignores case on both sides", () => {
    expect(ids("INVITE")).toEqual(["stop", "resume", "run"]);
  });

  it("passes the rows built from the query whatever was typed, and puts them last", () => {
    expect(ids("nothing matches this")).toEqual(["run"]);
    expect(filterCommands(COMMANDS, "cost").at(-1)?.id).toBe("run");
  });
});

describe("moveSelection", () => {
  it("wraps past the end and before the start", () => {
    expect(moveSelection(0, 3, 1)).toBe(1);
    expect(moveSelection(2, 3, 1)).toBe(0);
    expect(moveSelection(0, 3, -1)).toBe(2);
    expect(moveSelection(1, 3, -1)).toBe(0);
  });

  it("has only row 0 to sit on in an empty list", () => {
    expect(moveSelection(0, 0, 1)).toBe(0);
    expect(moveSelection(4, 0, -1)).toBe(0);
  });
});
