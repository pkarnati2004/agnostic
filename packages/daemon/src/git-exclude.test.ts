import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { excludeFromGit, includeInGit, keepOutOfGit } from "./git-exclude.js";
import { gitIn } from "./test-task-run.js";
import { createWorkspace } from "./test-workspace.js";

const PATH = ".claude/settings.local.json";

let repo = "";
let scratch = "";

beforeEach(async () => {
  repo = await createWorkspace({});
  scratch = await mkdtemp(join(tmpdir(), "agn-exclude-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
});

const excludeFile = () => join(repo, ".git", "info", "exclude");
const lines = async () => (await readFile(excludeFile(), "utf8")).split("\n");

describe("excludeFromGit", () => {
  it("adds the path once however often it is asked", async () => {
    expect(await excludeFromGit(repo, PATH)).toBe(true);
    expect(await excludeFromGit(repo, PATH)).toBe(false);
    expect((await lines()).filter((line) => line === PATH)).toHaveLength(1);
  });

  it("writes a linked worktree's line into the main repo's exclude file", async () => {
    const worktree = join(scratch, "wt");
    await gitIn(repo, ["worktree", "add", "-q", "-b", "topic", worktree]);
    expect(await excludeFromGit(worktree, PATH)).toBe(true);
    expect(await lines()).toContain(PATH);
  });

  it("creates a missing info directory", async () => {
    await rm(join(repo, ".git", "info"), { recursive: true, force: true });
    expect(await excludeFromGit(repo, PATH)).toBe(true);
    expect(await lines()).toContain(PATH);
  });

  it("does nothing in a directory that is not a git repo", async () => {
    expect(await excludeFromGit(scratch, PATH)).toBe(false);
    await expect(readFile(join(scratch, ".git", "info", "exclude"), "utf8")).rejects.toThrow();
  });
});

describe("includeInGit", () => {
  it("removes the path and keeps the user's lines above and below it", async () => {
    await writeFile(excludeFile(), "# mine\nbuild/\n", "utf8");
    await excludeFromGit(repo, PATH);
    const text = await readFile(excludeFile(), "utf8");
    await writeFile(excludeFile(), `${text}*.log\n`, "utf8");

    expect(await includeInGit(repo, PATH)).toBe(true);

    expect(await readFile(excludeFile(), "utf8")).toBe("# mine\nbuild/\n*.log\n");
  });

  it("removes only the line equal to the path, not one that merely contains it", async () => {
    await writeFile(excludeFile(), `${PATH}.bak\n${PATH}\n`, "utf8");
    expect(await includeInGit(repo, PATH)).toBe(true);
    expect(await readFile(excludeFile(), "utf8")).toBe(`${PATH}.bak\n`);
  });

  it("answers false when the path was not there, or there is no git", async () => {
    expect(await includeInGit(repo, PATH)).toBe(false);
    expect(await includeInGit(scratch, PATH)).toBe(false);
  });
});

describe("keepOutOfGit", () => {
  it("excludes a file inside the directory by its relative path", async () => {
    await keepOutOfGit(repo, join(repo, PATH), "exclude");
    expect(await lines()).toContain(PATH);
  });

  it("writes no line for a file outside the directory, such as one under HOME", async () => {
    await keepOutOfGit(repo, join(scratch, ".codex", "hooks.json"), "exclude");
    await keepOutOfGit(repo, join(repo, "..", "sibling", "hooks.json"), "exclude");
    expect(await readFile(excludeFile(), "utf8").catch(() => "")).not.toContain("hooks.json");
  });

  it("treats a directory named with two leading dots as inside", async () => {
    await keepOutOfGit(repo, join(repo, "..hooks", "a.json"), "exclude");
    expect(await lines()).toContain("..hooks/a.json");
  });
});
