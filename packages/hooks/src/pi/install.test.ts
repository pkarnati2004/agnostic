import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HooksError } from "../error.js";
import { AGN_MANAGED_MARKER } from "../managed-file.js";
import { piFamilyInstaller } from "./install.js";

const FIXTURES = fileURLToPath(new URL("../../../../tests/fixtures/hooks/", import.meta.url));

let home = "";
let repoPath = "";

const input = () => ({
  repoPath,
  home,
  command: "sh '/home/u/.agnostic/hooks/post.sh' pi",
  paths: agnosticPaths(join(home, ".agnostic")),
  env: {},
});

const piFile = () => join(home, ".pi", "agent", "extensions", "agn-status.ts");

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

describe("the Pi extension installer", () => {
  it("writes one extension per user, marked as agn's", async () => {
    const result = await piFamilyInstaller("pi").install(input());
    expect(result).toEqual({
      harness: "pi",
      file: piFile(),
      changed: true,
      verify: "restart pi if it was running: extensions load at start",
    });
    const source = await readFile(piFile(), "utf8");
    expect(source.split("\n")[0]).toBe(AGN_MANAGED_MARKER);
    expect((await stat(piFile())).mode & 0o777).toBe(0o644);
  });

  it("reports no change when the extension is already the one agn writes", async () => {
    await piFamilyInstaller("pi").install(input());
    expect((await piFamilyInstaller("pi").install(input())).changed).toBe(false);
  });

  it("writes OMP's extension under its own directory", async () => {
    const result = await piFamilyInstaller("omp").install(input());
    expect(result.file).toBe(join(home, ".omp", "agent", "extensions", "agn-status.ts"));
    expect(await readFile(result.file, "utf8")).toContain("/hooks/omp");
  });

  it("removes what it wrote, and reports nothing to remove twice", async () => {
    await piFamilyInstaller("pi").install(input());
    expect((await piFamilyInstaller("pi").uninstall(input())).changed).toBe(true);
    expect((await piFamilyInstaller("pi").uninstall(input())).changed).toBe(false);
  });

  it("refuses an extension of the same name the user wrote, and leaves it alone", async () => {
    await mkdir(join(home, ".pi", "agent", "extensions"), { recursive: true });
    await copyFile(join(FIXTURES, "extensions", "pi", "user-extension.ts"), piFile());
    const before = await readFile(piFile(), "utf8");
    await expect(piFamilyInstaller("pi").install(input())).rejects.toMatchObject({
      code: "hook-config-unwritable",
    });
    await expect(piFamilyInstaller("pi").install(input())).rejects.toBeInstanceOf(HooksError);
    expect(await readFile(piFile(), "utf8")).toBe(before);
    expect((await piFamilyInstaller("pi").uninstall(input())).changed).toBe(false);
  });
});
