import { describe, expect, it } from "vitest";
import { agPaths, taskNotePath } from "./ag-layout.js";

describe("agPaths", () => {
  it("puts every file under <repo>/.ag", () => {
    expect(agPaths("/repos/app")).toEqual({
      dir: "/repos/app/.ag",
      agnosticYaml: "/repos/app/.ag/agnostic.yaml",
      preferencesYaml: "/repos/app/.ag/preferences.yaml",
      instructionsMd: "/repos/app/.ag/instructions.md",
      decisionsMd: "/repos/app/.ag/decisions.md",
      mcpYaml: "/repos/app/.ag/mcp.yaml",
      tasksDir: "/repos/app/.ag/tasks",
    });
  });
});

describe("taskNotePath", () => {
  it("names the note after the task id", () => {
    expect(taskNotePath("/repos/app", "t3n9v2wxyz")).toBe("/repos/app/.ag/tasks/t3n9v2wxyz.md");
  });
});
