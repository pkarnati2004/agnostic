import { fileURLToPath } from "node:url";
import { type DesignTool, DesignToolIdSchema } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { designToolList } from "./design-tool-list.js";
import { designToolCommand, detectDesignTools } from "./detect-design-tools.js";

const APPS = fileURLToPath(new URL("../../../tests/fixtures/apps", import.meta.url));

function detect(appDirs: string[] = []): Promise<DesignTool[]> {
  return detectDesignTools({
    env: { PATH: "" },
    home: "/home/nobody",
    platform: "darwin",
    appDirs,
  });
}

describe("designToolList", () => {
  it("covers every design tool id exactly once, in the schema's order", () => {
    expect(designToolList.map((entry) => entry.id)).toEqual(DesignToolIdSchema.options);
  });
});

describe("detectDesignTools", () => {
  it("opens a tool whose app bundle is installed by its own path", async () => {
    const figma = (await detect([APPS])).find((tool) => tool.id === "figma");
    expect(figma).toEqual({
      id: "figma",
      name: "Figma",
      via: "app",
      path: `${APPS}/Figma.app`,
    });
  });

  it("falls back to the tool's address when nothing is installed", async () => {
    expect(await detect()).toEqual([
      { id: "claude-design", name: "Claude Design", via: "url", path: "https://claude.ai/design" },
      { id: "figma", name: "Figma", via: "url", path: "https://www.figma.com" },
    ]);
  });
});

describe("designToolCommand", () => {
  it("hands the system opener the bundle detection found, and no folder", () => {
    const tool: DesignTool = {
      id: "figma",
      name: "Figma",
      via: "app",
      path: "/Applications/Figma.app",
    };
    expect(designToolCommand(tool)).toEqual(["open", "-a", "/Applications/Figma.app"]);
  });

  it("hands it the address for a tool with no local install", () => {
    const tool: DesignTool = {
      id: "claude-design",
      name: "Claude Design",
      via: "url",
      path: "https://claude.ai/design",
    };
    expect(designToolCommand(tool)).toEqual(["open", "https://claude.ai/design"]);
  });
});
