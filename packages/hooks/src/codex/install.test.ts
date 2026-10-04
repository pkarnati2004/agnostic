import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codexInstaller } from "./install.js";

const FIXTURES = fileURLToPath(new URL("../../../../tests/fixtures/hooks/", import.meta.url));
const COMMAND = "sh '/home/u/.agnostic/hooks/post.sh' codex";

let home = "";
let repoPath = "";

const input = () => ({
  repoPath,
  home,
  command: COMMAND,
  paths: agnosticPaths(join(home, ".agnostic")),
  env: {},
});
const hooksFile = () => join(home, ".codex", "hooks.json");
const configFile = () => join(home, ".codex", "config.toml");
const config = () => readFile(configFile(), "utf8");

async function withPluginConfig(): Promise<string> {
  await mkdir(join(home, ".codex"), { recursive: true });
  await copyFile(join(FIXTURES, "codex-config", "with-plugin.toml"), configFile());
  return config();
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-home-"));
  repoPath = await mkdtemp(join(tmpdir(), "agn-repo-"));
  // The installer says out loud that it wrote outside the repo; tests read it, they do not print it.
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
  await rm(repoPath, { recursive: true, force: true });
});

describe("the Codex hook installer", () => {
  it("writes six events per user, and a trust table for each", async () => {
    const result = await codexInstaller.install(input());
    expect(result.harness).toBe("codex");
    expect(result.file).toBe(hooksFile());
    expect(result.changed).toBe(true);
    expect(result.verify).toMatch(/hooks/);
    const hooks = JSON.parse(await readFile(hooksFile(), "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    expect(Object.keys(hooks.hooks).sort()).toEqual([
      "PermissionRequest",
      "PostToolUse",
      "PreToolUse",
      "SessionStart",
      "Stop",
      "UserPromptSubmit",
    ]);
    expect((await config()).match(/trusted_hash/g)).toHaveLength(6);
  });

  it("keys its trust tables by the real path of the hooks file", async () => {
    await codexInstaller.install(input());
    const real = await readFile(configFile(), "utf8");
    expect(real).toContain(':stop:0:0"]');
    expect(real).not.toContain("/private/../");
  });

  it("says on stderr what it wrote outside the repo, and only when it wrote", async () => {
    const said = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await codexInstaller.install(input());
    expect(said).toHaveBeenCalledTimes(1);
    expect(String(said.mock.calls[0]?.[0])).toContain(hooksFile());
    await codexInstaller.install(input());
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("leaves every line of an existing config in place", async () => {
    const before = await withPluginConfig();
    await codexInstaller.install(input());
    const after = await config();
    for (const line of before.split("\n")) {
      expect(after).toContain(line);
    }
    expect(after.startsWith(before)).toBe(true);
  });

  it("changes nothing on a reinstall", async () => {
    await codexInstaller.install(input());
    const written = await config();
    const again = await codexInstaller.install(input());
    expect(again.changed).toBe(false);
    expect(await config()).toBe(written);
  });

  it("rewrites only the hashes when the command changes", async () => {
    await withPluginConfig();
    await codexInstaller.install(input());
    const before = await config();
    await codexInstaller.install({ ...input(), command: `${COMMAND} --other` });
    const after = await config();
    expect(after.split("\n")).toHaveLength(before.split("\n").length);
    expect(after).not.toBe(before);
    // Six of ours, plus the one a plugin already had in the fixture.
    expect(after.match(/trusted_hash/g)).toHaveLength(7);
  });

  it("removes its entries and its tables on uninstall", async () => {
    const before = await withPluginConfig();
    await codexInstaller.install(input());
    const result = await codexInstaller.uninstall(input());
    expect(result.changed).toBe(true);
    expect((await config()).trimEnd()).toBe(before.trimEnd());
    // Nothing of agn's is left, so the key it added is not left behind either.
    const hooks = JSON.parse(await readFile(hooksFile(), "utf8")) as { hooks?: object };
    expect(hooks.hooks).toBeUndefined();
  });

  it("refuses a config with one of agn's own tables already outside the block, unchanged", async () => {
    await mkdir(join(home, ".codex"), { recursive: true });
    // A placeholder so the real path of the hooks file - what the installer keys a table by - is
    // known before the install this test expects to fail. Its content never matters.
    await writeFile(hooksFile(), "{}", "utf8");
    const key = `${await realpath(hooksFile())}:stop:0:0`;
    // The trust key agn's install would compute for Stop, already present with no marked block
    // around it: a stray table Codex could have written when the user approved it in `/hooks`.
    const stray = [
      'notify = ["x"]',
      "",
      `[hooks.state."${key}"]`,
      'trusted_hash = "sha256:theirs"',
      "",
    ].join("\n");
    await writeFile(configFile(), stray, "utf8");
    await expect(codexInstaller.install(input())).rejects.toMatchObject({
      code: "hook-config-unwritable",
    });
    expect(await config()).toBe(stray);
  });

  it("keeps the trust table Codex appended inside its block, below it", async () => {
    await codexInstaller.install(input());
    // What Codex writes when the user presses "Trust all and continue": toml_edit appends the table
    // after the last `hooks.state` table in the file, which is the last one in agn's block.
    const theirs = `[hooks.state."${await realpath(hooksFile())}:notify:0:0"]\ntrusted_hash = "sha256:theirs"\n`;
    const end = "# <<< agn hooks <<<";
    await writeFile(configFile(), (await config()).replace(end, `${theirs}${end}`), "utf8");
    const again = await codexInstaller.install({ ...input(), command: `${COMMAND} --other` });
    expect(again.changed).toBe(true);
    const after = await config();
    expect(after).toContain(theirs);
    expect(after.indexOf(theirs)).toBeGreaterThan(after.indexOf(end));
    // A third install finds it outside the block and still leaves it alone.
    await codexInstaller.install({ ...input(), command: `${COMMAND} --other` });
    const third = await config();
    expect(third.match(/sha256:theirs/g)).toHaveLength(1);
    expect(third.indexOf(theirs)).toBeGreaterThan(third.indexOf(end));
  });

  it("retires its own table when a hooks.json change shifts the handler index", async () => {
    await codexInstaller.install(input());
    expect(await config()).toContain(":stop:0:0");
    // A hook the user adds before agn's moves agn's handler to group 1, so the key changes.
    const hooks = JSON.parse(await readFile(hooksFile(), "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    const stop = hooks.hooks.Stop ?? [];
    hooks.hooks.Stop = [{ hooks: [{ type: "command", command: "echo mine" }] }, ...stop];
    await writeFile(hooksFile(), JSON.stringify(hooks, null, 2), "utf8");
    await codexInstaller.install(input());
    const after = await config();
    expect(after).toContain(":stop:1:0");
    // The stale table carried agn's marker, so it left with the old block, not below it.
    expect(after).not.toContain(":stop:0:0");
    expect(after.match(/trusted_hash/g)).toHaveLength(6);
  });

  it("creates the config file when Codex has none", async () => {
    await codexInstaller.install(input());
    expect(await config()).toContain("[hooks.state.");
  });
});
