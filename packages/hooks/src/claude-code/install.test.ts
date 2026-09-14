import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeCodeInstaller } from "./install.js";

const FIXTURES = fileURLToPath(new URL("../../../../tests/fixtures/hooks/", import.meta.url));
const COMMAND = "sh '/home/u/.agnostic/hooks/post.sh' claude-code";

let repoPath = "";
let home = "";

const input = () => ({ repoPath, home, command: COMMAND });
const settings = () => join(repoPath, ".claude", "settings.local.json");
const exclude = () => join(repoPath, ".git", "info", "exclude");

async function readSettings(): Promise<{
  hooks?: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
  permissions?: unknown;
}> {
  return JSON.parse(await readFile(settings(), "utf8"));
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-home-"));
  repoPath = await mkdtemp(join(tmpdir(), "agn-repo-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(repoPath, { recursive: true, force: true });
});

describe("the Claude Code hook installer", () => {
  it("writes the seven events, with a matcher only where one belongs", async () => {
    const result = await claudeCodeInstaller.install(input());
    expect(result).toEqual({
      harness: "claude-code",
      file: settings(),
      changed: true,
      verify: null,
    });
    const config = await readSettings();
    expect(Object.keys(config.hooks ?? {}).sort()).toEqual([
      "Notification",
      "PermissionRequest",
      "PostToolUse",
      "PreToolUse",
      "SessionStart",
      "Stop",
      "UserPromptSubmit",
    ]);
    expect(config.hooks?.PreToolUse?.[0]?.matcher).toBe("AskUserQuestion");
    expect(config.hooks?.Stop?.[0]?.matcher).toBeUndefined();
  });

  it("is a no-op the second time, down to the bytes", async () => {
    await claudeCodeInstaller.install(input());
    const written = await readFile(settings(), "utf8");
    const again = await claudeCodeInstaller.install(input());
    expect(again.changed).toBe(false);
    expect(await readFile(settings(), "utf8")).toBe(written);
  });

  it("keeps a user's own Stop hook and the rest of their settings", async () => {
    await mkdir(join(repoPath, ".claude"), { recursive: true });
    await copyFile(join(FIXTURES, "settings-local", "user-hooks.json"), settings());
    await claudeCodeInstaller.install(input());
    const config = await readSettings();
    expect(config.permissions).toEqual({ allow: ["Bash(git status:*)"] });
    expect(config.hooks?.Stop?.map((group) => group.hooks[0]?.command)).toEqual([
      "say done",
      COMMAND,
    ]);
  });

  it("removes its own entries on uninstall and leaves the user's", async () => {
    await mkdir(join(repoPath, ".claude"), { recursive: true });
    await copyFile(join(FIXTURES, "settings-local", "user-hooks.json"), settings());
    await claudeCodeInstaller.install(input());
    const result = await claudeCodeInstaller.uninstall(input());
    expect(result.changed).toBe(true);
    const config = await readSettings();
    expect(config.permissions).toEqual({ allow: ["Bash(git status:*)"] });
    expect(config.hooks?.Stop).toHaveLength(1);
    expect(config.hooks?.PreToolUse).toBeUndefined();
  });

  it("excludes the file from git, once, and never through .gitignore", async () => {
    await run("git", ["-C", repoPath, "init", "-q"]);
    // Whoever runs these tests may ignore this path globally already; the repo decides here.
    await run("git", ["-C", repoPath, "config", "core.excludesFile", "/dev/null"]);
    await claudeCodeInstaller.install(input());
    await claudeCodeInstaller.install(input());
    const lines = (await readFile(exclude(), "utf8")).split("\n");
    expect(lines.filter((line) => line === ".claude/settings.local.json")).toHaveLength(1);
    await expect(readFile(join(repoPath, ".gitignore"), "utf8")).rejects.toThrow();
  });

  it("adds nothing to the exclude file when git already ignores the path", async () => {
    await run("git", ["-C", repoPath, "init", "-q"]);
    await writeFile(join(repoPath, ".gitignore"), ".claude/\n", "utf8");
    await claudeCodeInstaller.install(input());
    expect(await readFile(exclude(), "utf8")).not.toContain("settings.local.json");
  });

  it("installs in a directory that is not a git repo at all", async () => {
    const result = await claudeCodeInstaller.install(input());
    expect(result.changed).toBe(true);
    expect(await readSettings()).toHaveProperty("hooks");
  });

  it("refuses a settings file it cannot read, and leaves it as it was", async () => {
    await mkdir(join(repoPath, ".claude"), { recursive: true });
    await writeFile(settings(), '{ "hooks": {},}', "utf8");
    await expect(claudeCodeInstaller.install(input())).rejects.toMatchObject({
      code: "hook-config-unreadable",
    });
    expect(await readFile(settings(), "utf8")).toBe('{ "hooks": {},}');
  });
});
