import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  installUserStatusLine,
  originalStatusLineFile,
  readUserStatusLine,
  uninstallUserStatusLine,
  userSettingsFile,
} from "./user-statusline.js";

let home = "";

const paths = () => agnosticPaths(join(home, ".agnostic"));
const scope = (env: Record<string, string> = {}) => ({ home, paths: paths(), env });
const script = () => join(home, ".agnostic", "hooks", "statusline.sh");
const sidecar = () => originalStatusLineFile(paths());

type Entry = { type?: string; command?: string; padding?: number };

async function writeSettings(entry: Entry | null, env: Record<string, string> = {}): Promise<void> {
  const file = userSettingsFile(home, env);
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify(entry === null ? {} : { statusLine: entry }), "utf8");
}

async function readEntry(env: Record<string, string> = {}): Promise<Entry | undefined> {
  const text = await readFile(userSettingsFile(home, env), "utf8");
  return (JSON.parse(text) as { statusLine?: Entry }).statusLine;
}

async function readSidecar(): Promise<{ file: string; statusLine?: Entry }> {
  return JSON.parse(await readFile(sidecar(), "utf8"));
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-home-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("installUserStatusLine", () => {
  it("fills an empty slot with agn's script and records no original", async () => {
    const result = await installUserStatusLine(scope());

    expect(result).toEqual({ file: userSettingsFile(home, {}), changed: true });
    expect(await readEntry()).toEqual({ type: "command", command: `sh '${script()}'` });
    await expect(readFile(sidecar(), "utf8")).rejects.toThrow();
  });

  it("removes a sidecar left over from a status line that is gone", async () => {
    await writeSettings({ type: "command", command: "mine" });
    await installUserStatusLine(scope());
    await writeSettings(null);

    await installUserStatusLine(scope());

    await expect(readFile(sidecar(), "utf8")).rejects.toThrow();
  });

  it("wraps the user's own command and keeps their other keys", async () => {
    await writeSettings({ type: "command", command: "mine", padding: 0 });

    await installUserStatusLine(scope());

    expect(await readEntry()).toEqual({
      type: "command",
      command: `sh '${script()}' 'mine'`,
      padding: 0,
    });
    expect(await readSidecar()).toEqual({
      file: userSettingsFile(home, {}),
      statusLine: { type: "command", command: "mine", padding: 0 },
    });
  });

  it("escapes a quote inside the user's own command", async () => {
    await writeSettings({ command: `printf 'hi'` });

    await installUserStatusLine(scope());

    expect((await readEntry())?.command).toBe(`sh '${script()}' 'printf '\\''hi'\\'''`);
  });

  it("writes nothing on a second install", async () => {
    await writeSettings({ type: "command", command: "mine" });
    await installUserStatusLine(scope());

    expect(await installUserStatusLine(scope())).toMatchObject({ changed: false });
  });

  it("rewrites its own entry from the original the sidecar holds", async () => {
    await writeSettings({ type: "command", command: `sh '${script()}' 'stale'`, padding: 2 });
    await mkdir(paths().hooks, { recursive: true });
    await writeFile(
      sidecar(),
      JSON.stringify({ file: userSettingsFile(home, {}), statusLine: { command: "mine" } }),
      "utf8",
    );

    const result = await installUserStatusLine(scope());

    expect(result.changed).toBe(true);
    expect(await readEntry()).toEqual({
      type: "command",
      command: `sh '${script()}' 'mine'`,
      padding: 2,
    });
  });

  it("leaves its own entry alone when nothing records the original", async () => {
    const entry = { type: "command", command: `sh '${script()}' 'mine'` };
    await writeSettings(entry);

    expect(await installUserStatusLine(scope())).toMatchObject({ changed: false });
    expect(await readEntry()).toEqual(entry);
  });

  it("follows CLAUDE_CONFIG_DIR for both the settings file and the original", async () => {
    const elsewhere = join(home, "other-claude");
    const env = { CLAUDE_CONFIG_DIR: elsewhere };
    await writeSettings({ command: "mine" }, env);

    const result = await installUserStatusLine(scope(env));

    expect(result.file).toBe(join(elsewhere, "settings.json"));
    expect((await readEntry(env))?.command).toBe(`sh '${script()}' 'mine'`);
    expect((await readSidecar()).file).toBe(join(elsewhere, "settings.json"));
  });

  it("refuses a settings file it cannot read, and writes nothing", async () => {
    const file = userSettingsFile(home, {});
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, "{ not json", "utf8");

    await expect(installUserStatusLine(scope())).rejects.toMatchObject({
      code: "hook-config-unreadable",
    });
    expect(await readFile(file, "utf8")).toBe("{ not json");
  });
});

describe("uninstallUserStatusLine", () => {
  it("puts the user's own entry back key for key and deletes the sidecar", async () => {
    const entry = { type: "command", command: "mine", padding: 0 };
    await writeSettings(entry);
    await installUserStatusLine(scope());

    const result = await uninstallUserStatusLine(scope());

    expect(result.changed).toBe(true);
    expect(await readEntry()).toEqual(entry);
    await expect(readFile(sidecar(), "utf8")).rejects.toThrow();
  });

  it("removes the key it added to a file that had no status line", async () => {
    await installUserStatusLine(scope());

    await uninstallUserStatusLine(scope());

    expect(await readEntry()).toBeUndefined();
  });

  it("leaves a status line the user wrote while agn's was not installed", async () => {
    const entry = { type: "command", command: "mine" };
    await writeSettings(entry);

    expect(await uninstallUserStatusLine(scope())).toMatchObject({ changed: false });
    expect(await readEntry()).toEqual(entry);
  });
});

describe("readUserStatusLine", () => {
  it("reads the user's own command from the slot", async () => {
    await writeSettings({ command: "mine" });

    expect(await readUserStatusLine(scope())).toBe("mine");
  });

  it("reads the original the sidecar holds once agn owns the slot", async () => {
    await writeSettings({ command: "mine" });
    await installUserStatusLine(scope());

    expect(await readUserStatusLine(scope())).toBe("mine");
  });

  it("reads no command when agn owns the slot and nothing records the original", async () => {
    await writeSettings({ command: `sh '${script()}' 'mine'` });

    expect(await readUserStatusLine(scope())).toBeNull();
  });

  it("reads no command when the user has no settings file of their own", async () => {
    expect(await readUserStatusLine(scope())).toBeNull();
  });

  it("reads no command from a settings file agn cannot parse", async () => {
    const file = userSettingsFile(home, {});
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, "{ not json", "utf8");

    expect(await readUserStatusLine(scope())).toBeNull();
  });
});
