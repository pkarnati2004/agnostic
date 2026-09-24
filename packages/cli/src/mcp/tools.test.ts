import { describe, expect, it } from "vitest";
import { findTool, tools } from "./tools.js";

const READ = ["agn_status", "agn_task", "agn_recommend", "agn_usage", "agn_profiles"];
const WRITE = ["agn_run", "agn_handoff", "agn_stop", "agn_resume"];

describe("the tool list", () => {
  it("holds the nine tools of ADR 036 Q11, the five read ones first", () => {
    expect(tools.map((tool) => tool.name)).toEqual([...READ, ...WRITE]);
  });

  it("marks the read tools and only those", () => {
    expect(tools.filter((tool) => tool.readOnly).map((tool) => tool.name)).toEqual(READ);
  });

  it("names every tool the way a client requires", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("findTool", () => {
  it("finds a tool by name and answers null for anything else", () => {
    expect(findTool("agn_run")?.name).toBe("agn_run");
    expect(findTool("agn_clean")).toBeNull();
    expect(findTool("")).toBeNull();
  });
});
