import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
  it("reads all four fields", async () => {
    expect(await readRepoConfig(`${FIXTURES}/complete`)).toEqual({
      id: "r7k2m4pqrs",
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      defaultProfileId: "claude-code:sonnet-4.5:native",
    });
  });

  it("leaves the optional fields null when only an id is set", async () => {
    expect(await readRepoConfig(`${FIXTURES}/minimal`)).toEqual({
      id: "m5k7n2pqrs",
      testCommand: null,
      lintCommand: null,
      defaultProfileId: null,
    });
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
      id: "r7k2m4pqrs",
      testCommand: "pnpm test",
      lintCommand: "pnpm lint",
      defaultProfileId: "claude-code:default:native",
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
    });
  });
});
