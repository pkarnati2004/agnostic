import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CoreError } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { readInitInputs } from "./init-files.js";
import { type InitOptions, planInit } from "./init-plan.js";
import { fixtureRepo } from "./test-repo.js";

const REPO_ID = "r7k2m4pqrs";
const PLAIN: InitOptions = { from: null, force: false };

async function plan(name: string, opts: InitOptions = PLAIN) {
  return planInit(await readInitInputs(fixtureRepo(name), REPO_ID), opts);
}

function code(cause: unknown): string {
  return cause instanceof CoreError ? cause.code : String(cause);
}

describe("planInit seeds instructions.md", () => {
  it("from the only instructions file the repo has", async () => {
    const fromClaude = await plan("claude-only");
    expect(fromClaude.instructions?.source).toBe("CLAUDE.md");
    expect(fromClaude.instructions?.text).toBe(
      await readFile(join(fixtureRepo("claude-only"), "CLAUDE.md"), "utf8"),
    );
    expect((await plan("agents-only")).instructions?.source).toBe("AGENTS.md");
  });

  it("from CLAUDE.md when both files hold the same text", async () => {
    expect((await plan("both-same")).instructions?.source).toBe("CLAUDE.md");
  });

  it("from AGENTS.md when CLAUDE.md is only Claude Code's import of it", async () => {
    const seeded = await plan("claude-imports-agents");
    expect(seeded.instructions?.source).toBe("AGENTS.md");
    expect(seeded.instructions?.text).toBe(
      await readFile(join(fixtureRepo("claude-imports-agents"), "AGENTS.md"), "utf8"),
    );
  });

  it("from the template when the repo has neither file", async () => {
    const seeded = await plan("none");
    expect(seeded.instructions?.source).toBe("template");
    expect(seeded.instructions?.text.startsWith(`# ${basename(fixtureRepo("none"))}\n`)).toBe(true);
  });

  it("from the file --from names", async () => {
    const seeded = await plan("both-differ", { from: "AGENTS.md", force: false });
    expect(seeded.instructions?.source).toBe("AGENTS.md");
  });

  it("and refuses to guess when both files exist and differ", async () => {
    await expect(plan("both-differ")).rejects.toSatisfy(
      (cause: unknown) => code(cause) === "init-ambiguous-source",
    );
  });

  it("from the file the user wrote when the other one is agn's own copy", async () => {
    const seeded = await plan("generated-claude");
    expect(seeded.instructions?.source).toBe("AGENTS.md");
    expect(seeded.instructions?.text).toBe(
      await readFile(join(fixtureRepo("generated-claude"), "AGENTS.md"), "utf8"),
    );
  });

  it("and refuses when every candidate is a file agn generated", async () => {
    // The hint must never send the user to delete the file: it holds the only copy of the text.
    await expect(plan("generated-only")).rejects.toMatchObject({
      code: "init-source-generated",
      hint: "Restore .ag/instructions.md from git, or remove the first line of AGENTS.md and run `agn init --from AGENTS.md`.",
    });
  });

  it("and refuses when --from names a file agn generated", async () => {
    await expect(plan("generated-claude", { from: "CLAUDE.md", force: false })).rejects.toSatisfy(
      (cause: unknown) => code(cause) === "init-source-generated",
    );
  });

  it("and refuses when --from names a file that is not there", async () => {
    await expect(plan("claude-only", { from: "AGENTS.md", force: false })).rejects.toSatisfy(
      (cause: unknown) => code(cause) === "init-source-missing",
    );
  });
});

describe("planInit writes", () => {
  it("lists the five entries of .ag/ in order", async () => {
    expect((await plan("none")).writes.map((write) => write.file)).toEqual([
      ".ag/agnostic.yaml",
      ".ag/preferences.yaml",
      ".ag/instructions.md",
      ".ag/decisions.md",
      ".ag/tasks/.gitkeep",
    ]);
  });

  it("keeps an instructions.md that is already there, and seeds nothing", async () => {
    const kept = await plan("initialized");
    expect(kept.instructions).toBeNull();
    expect(kept.writes[2]).toEqual({
      file: ".ag/instructions.md",
      action: "kept",
      source: null,
    });
  });

  it("names the seed on the entry it created", async () => {
    expect((await plan("claude-only")).writes[2]).toEqual({
      file: ".ag/instructions.md",
      action: "created",
      source: "CLAUDE.md",
    });
  });
});
