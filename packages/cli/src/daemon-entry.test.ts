import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDaemonEntry, runDaemonCommand } from "./daemon-entry.js";
import { stubEntry } from "./test-context.js";

describe("resolveDaemonEntry", () => {
  it("points at a daemon entry that is on disk, run by this node", () => {
    const entry = resolveDaemonEntry();
    expect(entry.argv[0]).toBe(process.execPath);
    expect(existsSync(entry.argv[entry.argv.length - 1] ?? "")).toBe(true);
  });

  it("resolves the development condition's source file under vitest, not the built one", () => {
    // Only the suffix is asserted: the absolute path is a machine-specific temp/workspace location.
    const entry = resolveDaemonEntry();
    expect(entry.argv[entry.argv.length - 1]).toMatch(/\/src\/main\.ts$/);
  });
});

describe("resolveDaemonEntry from a published bundle", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "agn-bundle-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("runs the agnd.js that sits beside the running file", async () => {
    await writeFile(join(dir, "agnd.js"), "", "utf8");
    const entry = resolveDaemonEntry(pathToFileURL(join(dir, "main.js")).href);
    expect(entry.argv[0]).toBe(process.execPath);
    expect(entry.argv[entry.argv.length - 1]).toBe(join(dir, "agnd.js"));
  });

  it("forwards the parent's execArgv before the script", async () => {
    await writeFile(join(dir, "agnd.js"), "", "utf8");
    const entry = resolveDaemonEntry(pathToFileURL(join(dir, "main.js")).href);
    expect(entry.argv).toEqual([process.execPath, ...process.execArgv, join(dir, "agnd.js")]);
  });

  it("finds agnd.js in a directory whose name has a space", async () => {
    const spaced = join(dir, "with space");
    await mkdir(spaced);
    await writeFile(join(spaced, "agnd.js"), "", "utf8");
    const entry = resolveDaemonEntry(pathToFileURL(join(spaced, "main.js")).href);
    expect(entry.argv[entry.argv.length - 1]).toBe(join(spaced, "agnd.js"));
  });

  it("falls back to the workspace daemon when nothing sits beside it", () => {
    const entry = resolveDaemonEntry(pathToFileURL(join(dir, "main.js")).href);
    expect(entry.argv[entry.argv.length - 1]).toMatch(/\/src\/main\.ts$/);
  });
});

describe("runDaemonCommand", () => {
  it("returns the child's exit code and both streams instead of throwing", async () => {
    const result = await runDaemonCommand(stubEntry(), ["status"], {
      env: { AGND_STUB_EXIT: "2", AGND_STUB_STDERR: "stale" },
    });
    expect(result).toEqual({ exitCode: 2, stdout: "agnd-stub status", stderr: "stale" });
  });

  it("hands back what the daemon printed when it succeeds", async () => {
    const result = await runDaemonCommand(stubEntry(), ["start", "--port", "0"]);
    expect(result).toEqual({ exitCode: 0, stdout: "agnd-stub start --port 0", stderr: "" });
  });
});
