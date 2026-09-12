import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SyncTarget } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { GENERATED_HEADER, renderTarget } from "./generated-header.js";
import { planSync, type SyncInputs } from "./sync-plan.js";
import { fixtureRepo } from "./test-repo.js";

async function text(name: string, file: string): Promise<string> {
  return await readFile(join(fixtureRepo(name), file), "utf8");
}

/** The fixture's own files, with the instructions the plan is made from. */
async function inputsFor(name: string, instructions: string): Promise<SyncInputs> {
  const read = async (target: SyncTarget) => await text(name, target).catch(() => null);
  return {
    instructions,
    existing: { "CLAUDE.md": await read("CLAUDE.md"), "AGENTS.md": await read("AGENTS.md") },
  };
}

function actions(writes: ReturnType<typeof planSync>): string[] {
  return writes.map((write) => `${write.file} ${write.action}`);
}

describe("planSync", () => {
  it("creates both targets when a repo has neither", async () => {
    const inputs = await inputsFor("none", await text("synced", ".ag/instructions.md"));
    expect(actions(planSync(inputs, { force: false }))).toEqual([
      "CLAUDE.md create",
      "AGENTS.md create",
    ]);
  });

  it("leaves a repo that is already synced alone", async () => {
    const inputs = await inputsFor("synced", await text("synced", ".ag/instructions.md"));
    expect(actions(planSync(inputs, { force: false }))).toEqual([
      "CLAUDE.md unchanged",
      "AGENTS.md unchanged",
    ]);
  });

  it("updates a generated file whose body is out of date", async () => {
    const inputs = await inputsFor("stale", await text("stale", ".ag/instructions.md"));
    const writes = planSync(inputs, { force: false });
    expect(actions(writes)).toEqual(["CLAUDE.md unchanged", "AGENTS.md update"]);
    expect(writes[1]?.reason).toBeNull();
    expect(writes[1]?.content).toBe(renderTarget("AGENTS.md", inputs.instructions));
  });

  it("adopts the file agn init seeded the instructions from", async () => {
    const inputs = await inputsFor("initialized", await text("initialized", ".ag/instructions.md"));
    const writes = planSync(inputs, { force: false });
    expect(actions(writes)).toEqual(["CLAUDE.md update", "AGENTS.md create"]);
    expect(writes[0]?.reason).toBe("no header, same content");
  });

  it("adopts a CLAUDE.md that already holds nothing but the import", async () => {
    const inputs = await inputsFor(
      "claude-imports-agents",
      await text("claude-imports-agents", "AGENTS.md"),
    );
    const writes = planSync(inputs, { force: false });
    expect(actions(writes)).toEqual(["CLAUDE.md update", "AGENTS.md update"]);
    expect(writes[0]?.reason).toBe("no header, same content");
  });

  it("refuses a target someone wrote by hand", async () => {
    const inputs = await inputsFor("hand-edited", await text("hand-edited", ".ag/instructions.md"));
    const writes = planSync(inputs, { force: false });
    expect(actions(writes)).toEqual(["CLAUDE.md conflict", "AGENTS.md unchanged"]);
    expect(writes[0]?.reason).toBe("no header, hand-edited");
    expect(writes[0]?.content.startsWith(GENERATED_HEADER)).toBe(true);
  });

  it("overwrites that same file with force", async () => {
    const inputs = await inputsFor("hand-edited", await text("hand-edited", ".ag/instructions.md"));
    const writes = planSync(inputs, { force: true });
    expect(actions(writes)).toEqual(["CLAUDE.md update", "AGENTS.md unchanged"]);
    expect(writes[0]?.reason).toBe("overwritten with --force");
  });

  it("treats a target saved with CRLF as a different file, not a match", async () => {
    const instructions = await text("initialized", ".ag/instructions.md");
    const inputs: SyncInputs = {
      instructions,
      existing: {
        "CLAUDE.md": instructions.replace(/\n/g, "\r\n"),
        "AGENTS.md": null,
      },
    };
    expect(actions(planSync(inputs, { force: false }))).toEqual([
      "CLAUDE.md conflict",
      "AGENTS.md create",
    ]);
  });
});
