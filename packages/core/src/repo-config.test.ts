import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { describeIssues } from "./describe-issues.js";
import {
  defaultRepoConfig,
  RepoConfigSchema,
  readRepoConfig,
  writeRepoConfig,
} from "./repo-config.js";

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/ag", import.meta.url));

function tempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), "agnostic-repo-config-"));
}

describe("readRepoConfig", () => {
  it("reads every field", async () => {
    expect(await readRepoConfig(`${FIXTURES}/complete`)).toEqual({
      id: "r7k2m4pqrs",
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      defaultProfileId: "claude-code:sonnet-4.5:native",
      baseBranch: "main",
      branchPrefix: "feat/",
      setupCommand: "pnpm i --frozen-lockfile",
      cleanAfterMerge: true,
      designFolder: "design",
    });
  });

  it("leaves the optional fields null when only an id is set", async () => {
    expect(await readRepoConfig(`${FIXTURES}/minimal`)).toEqual(defaultRepoConfig("m5k7n2pqrs"));
  });

  it("returns null when the repo has no agnostic.yaml", async () => {
    expect(await readRepoConfig(`${FIXTURES}/none`)).toBeNull();
  });

  it("rejects a file that is not yaml", async () => {
    await expect(readRepoConfig(`${FIXTURES}/malformed`)).rejects.toMatchObject({
      name: "ConfigError",
      code: "ag-file-malformed",
      file: expect.stringContaining("/.ag/agnostic.yaml"),
      hint: expect.stringContaining("agn init --force"),
    });
  });

  it("names the key that failed the schema", async () => {
    await expect(readRepoConfig(`${FIXTURES}/invalid`)).rejects.toMatchObject({
      code: "ag-file-invalid",
      message: expect.stringContaining("id"),
      file: expect.stringContaining("/.ag/agnostic.yaml"),
      hint: expect.stringContaining("agn init --force"),
    });
  });
});

describe("RepoConfigSchema", () => {
  const valid = { id: "r7k2m4pqrs" };

  it("accepts a full profile id", () => {
    const parsed = RepoConfigSchema.parse({
      ...valid,
      default_profile: "claude-code:default:native",
    });
    expect(parsed.defaultProfileId).toBe("claude-code:default:native");
  });

  it("rejects a key nobody reads", () => {
    expect(RepoConfigSchema.safeParse({ ...valid, optimise: "quality" }).success).toBe(false);
  });

  it("rejects a branch prefix that is not a string", () => {
    expect(RepoConfigSchema.safeParse({ ...valid, branch_prefix: 3 }).success).toBe(false);
  });

  it("rejects the wrong type for every worktree key", () => {
    expect(RepoConfigSchema.safeParse({ ...valid, base_branch: 3 }).success).toBe(false);
    expect(RepoConfigSchema.safeParse({ ...valid, setup_command: 3 }).success).toBe(false);
    expect(RepoConfigSchema.safeParse({ ...valid, clean_after_merge: "true" }).success).toBe(false);
  });

  it("takes the worktree keys", () => {
    const parsed = RepoConfigSchema.parse({
      ...valid,
      base_branch: "main",
      setup_command: "pnpm i",
      clean_after_merge: true,
    });
    expect(parsed).toMatchObject({
      baseBranch: "main",
      setupCommand: "pnpm i",
      cleanAfterMerge: true,
      branchPrefix: null,
    });
  });

  it("takes a design folder, and falls back to design/ when the repo names none", () => {
    expect(RepoConfigSchema.parse({ ...valid, design_folder: "mockups" }).designFolder).toBe(
      "mockups",
    );
    expect(RepoConfigSchema.parse(valid).designFolder).toBe("design");
  });

  it("takes a nested design folder", () => {
    expect(RepoConfigSchema.parse({ ...valid, design_folder: "a/b" }).designFolder).toBe("a/b");
  });

  it("refuses a design folder that is not inside the worktree, naming the key", () => {
    for (const folder of ["/abs", "../x", "a/../b", "design/", ""]) {
      const parsed = RepoConfigSchema.safeParse({ ...valid, design_folder: folder });
      expect(parsed.success).toBe(false);
      expect(describeIssues(parsed.error as z.ZodError)).toContain("design_folder");
    }
  });

  it("rejects a default profile that is not a profile id", () => {
    expect(RepoConfigSchema.safeParse({ ...valid, default_profile: "nonsense" }).success).toBe(
      false,
    );
  });
});

describe("writeRepoConfig", () => {
  it("creates .ag/ and round-trips through readRepoConfig", async () => {
    const repo = await tempRepo();
    const config = {
      ...defaultRepoConfig("r7k2m4pqrs"),
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      defaultProfileId: "claude-code:default:native",
      baseBranch: "develop",
      branchPrefix: "agent/",
      setupCommand: "make deps",
      cleanAfterMerge: true,
      designFolder: "mockups",
    };
    await writeRepoConfig(repo, config);
    expect(await readRepoConfig(repo)).toEqual(config);
  });

  it("creates .ag/ when it does not exist yet", async () => {
    const repo = await tempRepo();
    await writeRepoConfig(repo, defaultRepoConfig("r7k2m4pqrs"));
    await expect(readFile(join(repo, ".ag", "agnostic.yaml"), "utf8")).resolves.toBeTruthy();
  });

  it("omits the keys that are null", async () => {
    const repo = await tempRepo();
    await writeRepoConfig(repo, defaultRepoConfig("r7k2m4pqrs"));
    const text = await readFile(join(repo, ".ag", "agnostic.yaml"), "utf8");
    expect(text).not.toContain("test_command");
    expect(text).not.toContain("lint_command");
    expect(text).not.toContain("default_profile");
    expect(text).not.toContain("base_branch");
    expect(text).not.toContain("clean_after_merge");
    expect(text).not.toContain("design_folder");
    expect(await readRepoConfig(repo)).toEqual(defaultRepoConfig("r7k2m4pqrs"));
  });
});

describe("defaultRepoConfig", () => {
  it("sets the id and nothing else", () => {
    expect(defaultRepoConfig("r7k2m4pqrs")).toEqual({
      id: "r7k2m4pqrs",
      testCommand: null,
      lintCommand: null,
      defaultProfileId: null,
      baseBranch: null,
      branchPrefix: null,
      setupCommand: null,
      cleanAfterMerge: false,
      designFolder: "design",
    });
  });
});
