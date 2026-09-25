import { describe, expect, it } from "vitest";
import { changesResponse } from "./changes-fixture";
import { adoptedLine, headerLine } from "./header-line";

describe("headerLine", () => {
  it("counts one commit as one", () => {
    expect(headerLine(changesResponse({ ahead: 1 })).commits).toBe("1 commit");
  });

  it("counts the rest as commits", () => {
    expect(headerLine(changesResponse({ ahead: 3 })).commits).toBe("3 commits");
  });

  it("says a clean worktree has nothing uncommitted", () => {
    expect(headerLine(changesResponse({ uncommitted: 0 })).uncommitted).toBe("0 uncommitted");
  });

  it("says nothing about a base that has not moved", () => {
    expect(headerLine(changesResponse({ behind: 0 })).behind).toBeNull();
    expect(headerLine(changesResponse({ behind: null })).behind).toBeNull();
  });

  it("says how far behind the base the branch is", () => {
    expect(headerLine(changesResponse({ behind: 4 })).behind).toBe("4 behind");
  });
});

describe("adoptedLine", () => {
  it("names the ref an adopted task is read against", () => {
    expect(adoptedLine(changesResponse())).toBe("adopted: changes against `main`");
  });
});
