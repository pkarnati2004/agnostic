import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { agPaths, defaultPreferences, readPreferences, readRepoConfig } from "@agnostic/core";
import { afterEach, describe, expect, it } from "vitest";
import { applyInitPlan, readInitInputs } from "./init-files.js";
import { type InitOptions, planInit } from "./init-plan.js";
import { copyFixture, fixtureRepo, removeCopies } from "./test-repo.js";

const REPO_ID = "r7k2m4pqrs";
const PLAIN: InitOptions = { from: null, force: false };

afterEach(removeCopies);

async function init(repo: string, opts: InitOptions = PLAIN) {
  const plan = planInit(await readInitInputs(repo, REPO_ID), opts);
  await applyInitPlan(repo, plan);
  return plan;
}

describe("applyInitPlan", () => {
  it("writes the five entries of .ag/", async () => {
    const repo = await copyFixture("claude-only");
    await init(repo);
    const paths = agPaths(repo);
    const config = await readRepoConfig(repo);
    expect(config).toEqual({
      id: REPO_ID,
      testCommand: null,
      lintCommand: null,
      defaultProfileId: null,
      baseBranch: null,
      branchPrefix: null,
      setupCommand: null,
      cleanAfterMerge: false,
      designFolder: "design",
    });
    expect(await readPreferences(repo)).toEqual(defaultPreferences());
    expect(await readFile(paths.decisionsMd, "utf8")).toBe("");
    expect((await stat(join(paths.tasksDir, ".gitkeep"))).isFile()).toBe(true);
  });

  it("seeds instructions.md byte for byte from the file it came from", async () => {
    const repo = await copyFixture("claude-only");
    await init(repo);
    expect(await readFile(agPaths(repo).instructionsMd, "utf8")).toBe(
      await readFile(join(fixtureRepo("claude-only"), "CLAUDE.md"), "utf8"),
    );
  });

  it("leaves the original CLAUDE.md where it was", async () => {
    const repo = await copyFixture("claude-only");
    await init(repo);
    expect(await readFile(join(repo, "CLAUDE.md"), "utf8")).toBe(
      await readFile(agPaths(repo).instructionsMd, "utf8"),
    );
  });

  it("keeps every entry on a second run", async () => {
    const repo = await copyFixture("claude-only");
    await init(repo);
    const before = await entries(repo);
    const plan = await init(repo);
    expect(plan.writes.map((write) => write.action)).toEqual([
      "kept",
      "kept",
      "kept",
      "kept",
      "kept",
    ]);
    expect(await entries(repo)).toEqual(before);
  });

  it("rewrites agnostic.yaml alone with force", async () => {
    const repo = await copyFixture("claude-only");
    await init(repo);
    const before = await entries(repo);
    const plan = await init(repo, { from: null, force: true });
    expect(plan.writes.map((write) => write.action)).toEqual([
      "rewritten",
      "kept",
      "kept",
      "kept",
      "kept",
    ]);
    const after = await entries(repo);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(await readRepoConfig(repo)).toMatchObject({ id: REPO_ID });
  });

  it("starts from the template in a repo with no instructions file", async () => {
    const repo = await copyFixture("none");
    await init(repo);
    const text = await readFile(agPaths(repo).instructionsMd, "utf8");
    expect(text).toContain("Instructions every coding agent reads");
    expect(text.endsWith("\n")).toBe(true);
  });
});

async function entries(repo: string): Promise<string[]> {
  const paths = agPaths(repo);
  return await Promise.all(
    [
      paths.agnosticYaml,
      paths.preferencesYaml,
      paths.instructionsMd,
      paths.decisionsMd,
      join(paths.tasksDir, ".gitkeep"),
    ].map((file) => readFile(file, "utf8")),
  );
}
