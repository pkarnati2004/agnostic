import type { HarnessId } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { RegistryError } from "./error.js";
import { harnessDefinition, harnesses } from "./harness-list.js";

describe("an id the table has no row for", () => {
  it("throws harness-unknown for an id that is not a harness and not other:<binary>", () => {
    expect(() => harnessDefinition("nope" as HarnessId)).toThrowError(RegistryError);
    try {
      harnessDefinition("nope" as HarnessId);
    } catch (error) {
      expect((error as RegistryError).code).toBe("harness-unknown");
      expect((error as RegistryError).hint).toContain("other:<binary>");
    }
  });

  it("says where a promoted harness went when it is asked for under other:", () => {
    for (const [id, moved] of [
      ["other:gemini", "gemini"],
      ["other:cursor", "cursor-agent"],
    ] as [HarnessId, string][]) {
      try {
        harnessDefinition(id);
        expect.unreachable(`${id} still resolves`);
      } catch (error) {
        expect((error as RegistryError).code).toBe("harness-unknown");
        expect((error as RegistryError).hint).toContain(moved);
      }
    }
  });
});

describe("an open harness id", () => {
  it("synthesises a launch-and-attach row for any executable", () => {
    expect(harnessDefinition("other:mytool")).toEqual({
      id: "other:mytool",
      name: "mytool",
      mark: "My",
      vendor: null,
      binary: "mytool",
      aliases: [],
      processNames: ["mytool"],
      launch: [],
      headless: null,
      prompt: { kind: "type-after-start" },
      modelFlag: null,
      modelSource: null,
      planSource: null,
      routes: ["native"],
      resume: null,
      sessionCapture: null,
      hooks: null,
      authFile: null,
      usageSource: null,
      limitSource: null,
      worktreeTrust: null,
      mcp: null,
      headlessDetect: null,
      tier: 2,
    });
  });

  it("never shadows a harness the table knows about", () => {
    expect(harnessDefinition("kiro").launch).toEqual(["chat", "--tui"]);
    expect(harnessDefinition("aider").name).toBe("Aider");
    expect(harnesses.map((def) => def.id)).not.toContain("other:mytool");
  });

  it("rejects an id whose binary segment is empty, a path, or shell-splittable", () => {
    for (const id of ["other:", "other:bin/tool", "other:my tool"] as HarnessId[]) {
      expect(() => harnessDefinition(id)).toThrowError(RegistryError);
      try {
        harnessDefinition(id);
      } catch (error) {
        expect((error as RegistryError).code).toBe("harness-unknown");
      }
    }
  });
});
