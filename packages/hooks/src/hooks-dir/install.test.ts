import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hookScriptPath } from "../hook-script.js";
import { copilotInstaller, copilotMember } from "./copilot.js";
import { grokInstaller, grokMember } from "./grok.js";
import { HOOKS_DIR_FILE } from "./install.js";

const FIXTURES = fileURLToPath(new URL("../../../../tests/fixtures/hooks/", import.meta.url));

let home = "";
let repoPath = "";

const input = () => ({
  repoPath,
  home,
  command: "unused: a hooks-dir installer builds one command per event",
  paths: agnosticPaths(join(home, ".agnostic")),
  env: {},
});

const hooksDir = (harness: "grok" | "copilot") => join(home, `.${harness}`, "hooks");
const agnFile = (harness: "grok" | "copilot") => join(hooksDir(harness), HOOKS_DIR_FILE);

/** The fixture cannot hold a temp path, so it names the script and the test fills it in. */
async function expectedConfig(harness: "grok" | "copilot"): Promise<string> {
  const text = await readFile(join(FIXTURES, "configs", harness, "expected.json"), "utf8");
  return text.replaceAll("<post.sh>", hookScriptPath(input().paths));
}

async function withSiblingFile(harness: "grok" | "copilot"): Promise<string> {
  await mkdir(hooksDir(harness), { recursive: true });
  const file = join(hooksDir(harness), "user.json");
  await copyFile(join(FIXTURES, "configs", harness, "user.json"), file);
  return file;
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

describe("the Grok hook installer", () => {
  it("installs the nine events Grok reports, matching every tool on the three tool events", () => {
    expect(grokMember.events.map((row) => row.event)).toEqual([
      "SessionStart",
      "UserPromptSubmit",
      "Stop",
      "StopFailure",
      "SessionEnd",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "Notification",
    ]);
    const matched = grokMember.events.filter((row) => row.matcher !== undefined);
    expect(matched.map((row) => row.matcher)).toEqual([".*", ".*", ".*"]);
  });

  it("writes its nine events into the one file in the hooks directory", async () => {
    const result = await grokInstaller.install(input());
    expect(result).toEqual({
      harness: "grok",
      file: agnFile("grok"),
      changed: true,
      verify: null,
    });
    expect(await readFile(result.file, "utf8")).toBe(await expectedConfig("grok"));
  });

  it("changes nothing on a reinstall", async () => {
    await grokInstaller.install(input());
    const written = await readFile(agnFile("grok"), "utf8");
    const again = await grokInstaller.install(input());
    expect(again.changed).toBe(false);
    expect(await readFile(agnFile("grok"), "utf8")).toBe(written);
  });

  it("replaces a hand-edited agn.json rather than merging into it", async () => {
    await grokInstaller.install(input());
    await writeFile(agnFile("grok"), '{ "hooks": { "Stop": [] } }\n', "utf8");
    const again = await grokInstaller.install(input());
    expect(again.changed).toBe(true);
    expect(await readFile(agnFile("grok"), "utf8")).toBe(await expectedConfig("grok"));
  });

  it("refuses an agn.json it cannot read, and leaves its bytes alone", async () => {
    await mkdir(hooksDir("grok"), { recursive: true });
    await writeFile(agnFile("grok"), "{ not json", "utf8");
    await expect(grokInstaller.install(input())).rejects.toMatchObject({
      code: "hook-config-unreadable",
    });
    expect(await readFile(agnFile("grok"), "utf8")).toBe("{ not json");
  });

  it("says on stderr what it wrote outside the repo, and only when it wrote", async () => {
    const said = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await grokInstaller.install(input());
    expect(said).toHaveBeenCalledTimes(1);
    expect(String(said.mock.calls[0]?.[0])).toContain(agnFile("grok"));
    await grokInstaller.install(input());
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("leaves another tool's file in the directory untouched, on install and on uninstall", async () => {
    const sibling = await withSiblingFile("grok");
    const before = await readFile(sibling, "utf8");
    await grokInstaller.install(input());
    await grokInstaller.uninstall(input());
    expect(await readFile(sibling, "utf8")).toBe(before);
  });

  it("removes its own file on uninstall, and is a no-op the second time", async () => {
    await grokInstaller.install(input());
    const result = await grokInstaller.uninstall(input());
    expect(result).toEqual({
      harness: "grok",
      file: agnFile("grok"),
      changed: true,
      verify: null,
    });
    await expect(readFile(agnFile("grok"), "utf8")).rejects.toThrow();
    // The directory is the harness's, so an empty one is left where it was.
    const again = await grokInstaller.uninstall(input());
    expect(again.changed).toBe(false);
  });

  it("refuses to install into a hooks directory it cannot write to", async () => {
    await mkdir(hooksDir("grok"), { recursive: true });
    await chmod(hooksDir("grok"), 0o500);
    try {
      await expect(grokInstaller.install(input())).rejects.toMatchObject({
        code: "hook-config-unwritable",
      });
    } finally {
      // A directory the test cannot write to is one afterEach cannot clean up either.
      await chmod(hooksDir("grok"), 0o700);
    }
  });

  it("still removes agn.json when it is read-only: unlinking is the directory's call, not the file's", async () => {
    await grokInstaller.install(input());
    await chmod(agnFile("grok"), 0o444);
    const result = await grokInstaller.uninstall(input());
    expect(result.changed).toBe(true);
    await expect(readFile(agnFile("grok"), "utf8")).rejects.toThrow();
  });

  it("uninstall throws rather than silently keeping agn.json when the directory itself is not writable", async () => {
    await grokInstaller.install(input());
    await chmod(hooksDir("grok"), 0o500);
    try {
      // `rm(file, { force: true })` only swallows a missing file; a directory nothing may write to
      // is a different failure, and it reaches the caller as the same error install() reports.
      await expect(grokInstaller.uninstall(input())).rejects.toMatchObject({
        code: "hook-config-unwritable",
      });
      expect(await readFile(agnFile("grok"), "utf8")).toContain("SessionStart");
    } finally {
      await chmod(hooksDir("grok"), 0o700);
    }
  });
});

describe("the Copilot hook installer", () => {
  it("installs ten events, none of them with a matcher Copilot would read as a regex", () => {
    expect(copilotMember.events.map((row) => row.event)).toEqual([
      "SessionStart",
      "SessionEnd",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "Stop",
      "ErrorOccurred",
      "PermissionRequest",
      "Notification",
    ]);
    expect(copilotMember.events.every((row) => row.matcher === undefined)).toBe(true);
  });

  it("writes version 1, ten events, and the event name on each command", async () => {
    const result = await copilotInstaller.install(input());
    expect(result.file).toBe(agnFile("copilot"));
    expect(result.changed).toBe(true);
    expect(result.verify).toContain("disableAllHooks");
    expect(await readFile(result.file, "utf8")).toBe(await expectedConfig("copilot"));
  });

  it("gives every command the reply Copilot reads on stdout", async () => {
    await copilotInstaller.install(input());
    const config = JSON.parse(await readFile(agnFile("copilot"), "utf8")) as {
      version: number;
      hooks: Record<string, Array<{ bash: string; timeoutSec: number }>>;
    };
    expect(config.version).toBe(1);
    expect(Object.keys(config.hooks)).toHaveLength(10);
    for (const [event, entries] of Object.entries(config.hooks)) {
      expect(entries).toHaveLength(1);
      expect(entries[0]?.timeoutSec).toBe(5);
      expect(entries[0]?.bash).toBe(
        `sh '${hookScriptPath(input().paths)}' copilot '${event}'; printf '%s\\n' '{}'`,
      );
    }
  });

  it("changes nothing on a reinstall, and removes its file on uninstall", async () => {
    await copilotInstaller.install(input());
    expect((await copilotInstaller.install(input())).changed).toBe(false);
    expect((await copilotInstaller.uninstall(input())).changed).toBe(true);
    await expect(readFile(agnFile("copilot"), "utf8")).rejects.toThrow();
  });

  it("leaves another tool's file in the directory untouched", async () => {
    const sibling = await withSiblingFile("copilot");
    const before = await readFile(sibling, "utf8");
    await copilotInstaller.install(input());
    await copilotInstaller.uninstall(input());
    expect(await readFile(sibling, "utf8")).toBe(before);
  });
});
