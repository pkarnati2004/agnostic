import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HookInstallInput } from "../hook-installer.js";
import { hookCommand } from "../hook-script.js";
import { kimiInstaller } from "./kimi.js";

/** Kimi is unverified live: its events come from Orca's `src/main/kimi/hook-service.ts`. */
const FIXTURES = fileURLToPath(new URL("../../../../tests/fixtures/hooks/", import.meta.url));

let home = "";
let repoPath = "";

const input = (): HookInstallInput => ({
  repoPath,
  home,
  command: hookCommand(agnosticPaths(join(home, ".agnostic")), "kimi"),
  paths: agnosticPaths(join(home, ".agnostic")),
  env: {},
});
const config = () => join(home, ".kimi-code", "config.toml");

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-home-"));
  repoPath = await mkdtemp(join(tmpdir(), "agn-repo-"));
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
  await rm(repoPath, { recursive: true, force: true });
});

describe("the Kimi hook installer", () => {
  it("writes its seven events into the config the registry names", async () => {
    const result = await kimiInstaller.install(input());
    expect(result).toMatchObject({ harness: "kimi", file: config(), changed: true });
    expect(result.verify).toMatch(/resume/);
    const text = await readFile(config(), "utf8");
    expect(text.match(/\[\[hooks]]/g)).toHaveLength(7);
    expect(text).toContain(`command = "${hookCommand(input().paths, "kimi")}"`);
  });

  it("is a no-op the second time, down to the bytes", async () => {
    await kimiInstaller.install(input());
    const written = await readFile(config(), "utf8");
    expect((await kimiInstaller.install(input())).changed).toBe(false);
    expect(await readFile(config(), "utf8")).toBe(written);
  });

  it("keeps the user's own tables and takes only its block back out", async () => {
    await mkdir(join(home, ".kimi-code"), { recursive: true });
    await copyFile(join(FIXTURES, "kimi-config", "with-provider.toml"), config());
    const before = await readFile(config(), "utf8");
    await kimiInstaller.install(input());
    expect((await readFile(config(), "utf8")).startsWith(before)).toBe(true);
    expect((await kimiInstaller.uninstall(input())).changed).toBe(true);
    expect(await readFile(config(), "utf8")).toBe(before);
  });

  it("writes nothing on uninstall when agn never touched the config", async () => {
    const result = await kimiInstaller.uninstall(input());
    expect(result.changed).toBe(false);
    await expect(readFile(config(), "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("refuses a block whose end marker is gone rather than guessing where it ended", async () => {
    await mkdir(join(home, ".kimi-code"), { recursive: true });
    await copyFile(join(FIXTURES, "kimi-config", "no-end-marker.toml"), config());
    const before = await readFile(config(), "utf8");
    await expect(kimiInstaller.install(input())).rejects.toMatchObject({
      code: "hook-config-unwritable",
    });
    expect(await readFile(config(), "utf8")).toBe(before);
  });
});
