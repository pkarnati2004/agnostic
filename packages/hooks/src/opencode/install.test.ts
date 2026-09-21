import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGN_MANAGED_MARKER } from "../managed-file.js";
import { opencodeFamilyInstaller } from "./install.js";

let home = "";
let repoPath = "";

const input = () => ({
  repoPath,
  home,
  command: "sh '/home/u/.agnostic/hooks/post.sh' opencode",
  paths: agnosticPaths(join(home, ".agnostic")),
  env: {},
});

const pluginFile = () => join(home, ".config", "opencode", "plugins", "agn-status.js");

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

describe("the OpenCode plugin installer", () => {
  it("writes one plugin per user, marked as agn's", async () => {
    const result = await opencodeFamilyInstaller("opencode").install(input());
    expect(result).toEqual({
      harness: "opencode",
      file: pluginFile(),
      changed: true,
      verify: "restart opencode if it was running: plugins load at start",
    });
    const source = await readFile(pluginFile(), "utf8");
    expect(source.split("\n")[0]).toBe(AGN_MANAGED_MARKER);
    expect(source).toContain("/hooks/opencode");
  });

  it("reports no change when the plugin is already the one agn writes", async () => {
    await opencodeFamilyInstaller("opencode").install(input());
    expect((await opencodeFamilyInstaller("opencode").install(input())).changed).toBe(false);
  });

  it("writes Mimo Code's plugin under its own config directory", async () => {
    const result = await opencodeFamilyInstaller("mimo-code").install(input());
    expect(result.file).toBe(join(home, ".config", "mimocode", "plugins", "agn-status.js"));
    expect(await readFile(result.file, "utf8")).toContain("/hooks/mimo-code");
  });

  it("removes what it wrote, and reports nothing to remove twice", async () => {
    await opencodeFamilyInstaller("opencode").install(input());
    expect((await opencodeFamilyInstaller("opencode").uninstall(input())).changed).toBe(true);
    expect((await opencodeFamilyInstaller("opencode").uninstall(input())).changed).toBe(false);
  });

  it("refuses a plugin of the same name the user wrote", async () => {
    await mkdir(join(home, ".config", "opencode", "plugins"), { recursive: true });
    await writeFile(pluginFile(), "export default { id: 'mine' }\n", "utf8");
    await expect(opencodeFamilyInstaller("opencode").install(input())).rejects.toMatchObject({
      code: "hook-config-unwritable",
    });
    expect(await readFile(pluginFile(), "utf8")).toBe("export default { id: 'mine' }\n");
  });
});
