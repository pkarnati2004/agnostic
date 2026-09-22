import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HookInstaller, HookInstallInput } from "../hook-installer.js";
import { hookCommand } from "../hook-script.js";
import { commandCodeInstaller } from "./command-code.js";
import { cursorAgentInstaller } from "./cursor-agent.js";
import { devinInstaller } from "./devin.js";
import { droidInstaller } from "./droid.js";
import { geminiInstaller } from "./gemini.js";
import { openClaudeInstaller } from "./openclaude.js";

/**
 * Every member but Claude Code is unverified live: the events and layouts below come from Orca's
 * per-agent installers (`src/main/<agent>/hook-service.ts`) and the fixtures from their tests.
 * Cursor's payload keys are not in Orca at all; they are inferred from the handoff and stay
 * unverified until someone runs cursor-agent.
 */
const FIXTURES = fileURLToPath(new URL("../../../../tests/fixtures/hooks/", import.meta.url));

type Member = {
  installer: HookInstaller;
  file: string;
  events: string[];
  /** The command the harness reads, on the entry itself or under `hooks`. */
  commandOf: (entry: Entry) => string | undefined;
};

type Entry = {
  matcher?: string;
  command?: string;
  hooks?: { command?: string; timeout?: number }[];
};
type Config = { hooks?: Record<string, Entry[]>; version?: number; [key: string]: unknown };

const nested = (entry: Entry) => entry.hooks?.[0]?.command;
const flat = (entry: Entry) => entry.command;

const MEMBERS: Record<string, Member> = {
  gemini: {
    installer: geminiInstaller,
    file: ".gemini/settings.json",
    events: ["BeforeAgent", "BeforeTool", "AfterTool", "AfterAgent"],
    commandOf: nested,
  },
  droid: {
    installer: droidInstaller,
    file: ".factory/settings.json",
    events: [
      "SessionStart",
      "UserPromptSubmit",
      "Stop",
      "PreToolUse",
      "PostToolUse",
      "PermissionRequest",
      "Notification",
    ],
    commandOf: nested,
  },
  "cursor-agent": {
    installer: cursorAgentInstaller,
    file: ".cursor/hooks.json",
    events: ["beforeSubmitPrompt", "stop", "postToolUse", "afterAgentResponse"],
    commandOf: flat,
  },
  devin: {
    installer: devinInstaller,
    file: ".config/devin/config.json",
    events: [
      "SessionStart",
      "UserPromptSubmit",
      "Stop",
      "PostCompaction",
      "SessionEnd",
      "PreToolUse",
      "PostToolUse",
      "PermissionRequest",
    ],
    commandOf: nested,
  },
  openclaude: {
    installer: openClaudeInstaller,
    file: ".openclaude/settings.json",
    events: [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "Notification",
      "PostToolUse",
      "Stop",
      "StopFailure",
    ],
    commandOf: nested,
  },
  "command-code": {
    installer: commandCodeInstaller,
    file: ".commandcode/settings.json",
    events: ["PreToolUse", "PostToolUse", "Stop"],
    commandOf: nested,
  },
};

let home = "";
let repoPath = "";

const input = (): HookInstallInput => ({
  repoPath,
  home,
  command: hookCommand(agnosticPaths(join(home, ".agnostic")), "claude-code"),
  paths: agnosticPaths(join(home, ".agnostic")),
  env: {},
});
const script = () => join(home, ".agnostic", "hooks", "post.sh");
const read = async (file: string): Promise<Config> => JSON.parse(await readFile(file, "utf8"));

async function place(member: string, fixture: string, file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await copyFile(join(FIXTURES, "configs", member, fixture), file);
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-home-"));
  repoPath = await mkdtemp(join(tmpdir(), "agn-repo-"));
  // Every member here installs per user, and says so on stderr; tests read that, they do not print it.
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
  await rm(repoPath, { recursive: true, force: true });
});

describe.each(Object.entries(MEMBERS))("the %s hook installer", (name, member) => {
  const file = () => join(home, member.file);

  it("writes its own events into the file the registry names", async () => {
    const result = await member.installer.install(input());
    expect(result).toMatchObject({ harness: name, file: file(), changed: true });
    const config = await read(file());
    expect(Object.keys(config.hooks ?? {})).toEqual(member.events);
    for (const entries of Object.values(config.hooks ?? {})) {
      expect(member.commandOf(entries[0] ?? {})).toContain(`'${script()}'`);
    }
  });

  it("is a no-op the second time, down to the bytes", async () => {
    await member.installer.install(input());
    const written = await readFile(file(), "utf8");
    expect((await member.installer.install(input())).changed).toBe(false);
    expect(await readFile(file(), "utf8")).toBe(written);
  });

  it("says on stderr what it wrote outside the repo, and only when it wrote", async () => {
    const said = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    await member.installer.install(input());
    expect(String(said.mock.calls[0]?.[0])).toContain(file());
    await member.installer.install(input());
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("keeps the user's own hooks and the rest of their config", async () => {
    await place(name, "user-hooks.json", file());
    const before = JSON.parse(await readFile(file(), "utf8")) as Record<string, unknown>;
    await member.installer.install(input());
    const config = await read(file());
    for (const [key, value] of Object.entries(before)) {
      if (key !== "hooks") {
        expect(config[key as keyof Config]).toEqual(value);
      }
    }
    const theirs = Object.values((before.hooks ?? {}) as Record<string, Entry[]>).flat();
    const ours = Object.values(config.hooks ?? {}).flat();
    for (const entry of theirs) {
      expect(ours.map(member.commandOf)).toContain(member.commandOf(entry));
    }
    // The keys agn did not write move around when a config is parsed; that is not a change.
    expect((await member.installer.install(input())).changed).toBe(false);
  });

  it("removes only its own entries on uninstall", async () => {
    await place(name, "user-hooks.json", file());
    const before = await readFile(file(), "utf8");
    await member.installer.install(input());
    expect((await member.installer.uninstall(input())).changed).toBe(true);
    const config = await read(file());
    expect(JSON.stringify(config.hooks)).not.toContain(script());
    expect(config.hooks).toEqual((JSON.parse(before) as Config).hooks);
  });

  it("writes nothing on uninstall when agn never touched the file", async () => {
    const result = await member.installer.uninstall(input());
    expect(result.changed).toBe(false);
    await expect(readFile(file(), "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("refuses a config it cannot read, and leaves its bytes alone", async () => {
    await mkdir(dirname(file()), { recursive: true });
    await writeFile(file(), '{ "hooks": {},}', "utf8");
    await expect(member.installer.install(input())).rejects.toMatchObject({
      // Devin's config is documented as JSONC, so an unreadable one is refused with the entries.
      code: name === "devin" ? "hook-config-unsupported" : "hook-config-unreadable",
    });
    expect(await readFile(file(), "utf8")).toBe('{ "hooks": {},}');
  });
});

describe("what each member needs that the others do not", () => {
  it("writes Gemini's timeout in milliseconds and answers every event on stdout", async () => {
    await geminiInstaller.install(input());
    const config = await read(join(home, ".gemini", "settings.json"));
    for (const entries of Object.values(config.hooks ?? {})) {
      expect(entries[0]?.hooks?.[0]?.timeout).toBe(5_000);
      expect(entries[0]?.hooks?.[0]?.command).toMatch(/; printf '%s\\n' '\{\}'$/);
    }
  });

  it("sweeps a Gemini PreToolUse entry from an older install and keeps the user's", async () => {
    const file = join(home, ".gemini", "settings.json");
    await mkdir(dirname(file), { recursive: true });
    const stale = await readFile(
      join(FIXTURES, "configs", "gemini", "stale-pre-tool-use.json"),
      "utf8",
    );
    // The fixture names agn's command by a placeholder: the script path is this test's temp home.
    await writeFile(
      file,
      stale.replace("<agn-hook-command>", hookCommand(input().paths, "gemini")),
    );
    await geminiInstaller.install(input());
    const config = await read(file);
    expect(config.hooks?.PreToolUse).toHaveLength(1);
    expect(config.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command).toBe("echo user-authored");
  });

  it("writes Cursor's layout and version exactly as Cursor reads them", async () => {
    await cursorAgentInstaller.install(input());
    const expected = await readFile(
      join(FIXTURES, "configs", "cursor-agent", "fresh-expected.json"),
      "utf8",
    );
    const command = hookCommand(input().paths, "cursor-agent");
    expect(await read(join(home, ".cursor", "hooks.json"))).toEqual(
      JSON.parse(expected.replaceAll("<agn-hook-command>", command)),
    );
  });

  it("keeps a Cursor version the user pinned, and their own gating hook", async () => {
    const file = join(home, ".cursor", "hooks.json");
    await place("cursor-agent", "user-hooks.json", file);
    await cursorAgentInstaller.install(input());
    const config = await read(file);
    expect(config.version).toBe(2);
    expect(config.hooks?.preToolUse).toEqual([{ command: "./scripts/audit.sh" }]);
  });

  it("tells the user to turn Factory's hooks back on, and only when they are off", async () => {
    const file = join(home, ".factory", "settings.json");
    expect((await droidInstaller.install(input())).verify).toBeNull();
    await rm(file);
    await place("droid", "hooks-disabled.json", file);
    expect((await droidInstaller.install(input())).verify).toMatch(/hooksDisabled/);
  });

  it("installs into a Devin config it can read, and never writes a matcher", async () => {
    const file = join(home, ".config", "devin", "config.json");
    await mkdir(dirname(file), { recursive: true });
    await copyFile(join(FIXTURES, "devin-config", "plain.json"), file);
    await devinInstaller.install(input());
    const config = await read(file);
    expect(Object.keys(config.hooks ?? {})).toHaveLength(8);
    expect(JSON.stringify(config.hooks)).not.toContain("matcher");
    expect(config.read_config_from).toEqual({ claude: true });
  });

  it("refuses a Devin config with comments, names the entries to paste, and writes nothing", async () => {
    const file = join(home, ".config", "devin", "config.json");
    await mkdir(dirname(file), { recursive: true });
    await copyFile(join(FIXTURES, "devin-config", "commented.json"), file);
    const before = await readFile(file, "utf8");
    await expect(devinInstaller.install(input())).rejects.toMatchObject({
      code: "hook-config-unsupported",
      hint: expect.stringContaining("SessionStart"),
    });
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("leaves Devin's read_config_from alone, whatever it says", async () => {
    const file = join(home, ".config", "devin", "config.json");
    await mkdir(dirname(file), { recursive: true });
    await copyFile(join(FIXTURES, "devin-config", "read-config-from-false.json"), file);
    await devinInstaller.install(input());
    expect((await read(file)).read_config_from).toEqual({ claude: false });
  });
});
