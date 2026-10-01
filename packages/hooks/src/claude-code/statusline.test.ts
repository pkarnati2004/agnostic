import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeCodeInstaller } from "./install.js";
import { statusLineCommand, statusLineSlot } from "./statusline.js";
import { installUserStatusLine } from "./user-statusline.js";

let repoPath = "";
let home = "";

const paths = () => agnosticPaths(join(home, ".agnostic"));
const input = (env: Record<string, string> = {}) => ({
  repoPath,
  home,
  command: "",
  paths: paths(),
  env,
});
const settings = () => join(repoPath, ".claude", "settings.local.json");
const script = () => join(home, ".agnostic", "hooks", "statusline.sh");

async function readSettings(): Promise<{ statusLine?: { type?: string; command?: string } }> {
  return JSON.parse(await readFile(settings(), "utf8"));
}

async function writeSettings(config: unknown): Promise<void> {
  await mkdir(join(repoPath, ".claude"), { recursive: true });
  await writeFile(settings(), JSON.stringify(config, null, 2), "utf8");
}

async function writeUserSettings(dir: string, command: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "settings.json"), JSON.stringify({ statusLine: { command } }), "utf8");
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-home-"));
  repoPath = await mkdtemp(join(tmpdir(), "agn-repo-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(repoPath, { recursive: true, force: true });
});

describe("the Claude Code status line", () => {
  it("installs agn's script into an empty slot", async () => {
    const result = await claudeCodeInstaller.install(input());

    expect(result.verify).toBeNull();
    expect((await readSettings()).statusLine).toEqual({
      type: "command",
      command: `sh '${script()}'`,
    });
  });

  it("rewrites its own entry when the user's own command has changed", async () => {
    await writeUserSettings(join(home, ".claude"), "my-line");
    await claudeCodeInstaller.install(input());
    await writeUserSettings(join(home, ".claude"), "my-other-line");

    await claudeCodeInstaller.install(input());

    expect((await readSettings()).statusLine?.command).toBe(`sh '${script()}' 'my-other-line'`);
  });

  it("leaves a status line the user wrote for this repo, and says so", async () => {
    await writeSettings({ statusLine: { type: "command", command: "theirs.sh" } });

    const result = await claudeCodeInstaller.install(input());

    expect((await readSettings()).statusLine?.command).toBe("theirs.sh");
    expect(result.verify).toBe(
      `a statusLine of your own is in ${settings()}; agn's rate-limit capture is off for this repo`,
    );
  });

  it("removes its own entry on uninstall and leaves the user's", async () => {
    await claudeCodeInstaller.install(input());
    await claudeCodeInstaller.uninstall(input());
    expect((await readSettings()).statusLine).toBeUndefined();

    await writeSettings({ statusLine: { type: "command", command: "theirs.sh" } });
    await claudeCodeInstaller.uninstall(input());

    expect((await readSettings()).statusLine?.command).toBe("theirs.sh");
  });

  it("escapes a quote inside the user's own command", () => {
    const command = statusLineCommand(paths(), `printf 'hi'`);

    expect(command).toBe(`sh '${script()}' 'printf '\\''hi'\\'''`);
  });

  it("chains the user's own command, not agn's wrapper, once agn owns the user slot", async () => {
    await writeUserSettings(join(home, ".claude"), "my-status");
    await installUserStatusLine({ home, paths: paths(), env: {} });

    await claudeCodeInstaller.install(input());

    const command = (await readSettings()).statusLine?.command ?? "";
    expect(command).toBe(`sh '${script()}' 'my-status'`);
    expect(command.split(script()).length - 1).toBe(1);
  });

  it("chains the command from the directory CLAUDE_CONFIG_DIR names", async () => {
    const elsewhere = join(home, "other-claude");
    await writeUserSettings(join(home, ".claude"), "the default one");
    await writeUserSettings(elsewhere, "the relocated one");

    await claudeCodeInstaller.install(input({ CLAUDE_CONFIG_DIR: elsewhere }));

    expect((await readSettings()).statusLine?.command).toContain("'the relocated one'");
  });
});

describe("statusLineSlot", () => {
  const marker = "'/home/.agnostic/hooks/statusline.sh'";

  it("calls an absent or empty command an empty slot", () => {
    expect(statusLineSlot({}, marker)).toBe("empty");
    expect(statusLineSlot({ statusLine: { command: "" } }, marker)).toBe("empty");
  });

  it("recognises its own command by the script path", () => {
    expect(statusLineSlot({ statusLine: { command: `sh ${marker}` } }, marker)).toBe("ours");
  });

  it("calls anything else the user's", () => {
    expect(statusLineSlot({ statusLine: { command: "starship" } }, marker)).toBe("user");
  });
});
