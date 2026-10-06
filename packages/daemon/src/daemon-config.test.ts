import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, ConfigError } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDaemonConfig } from "./daemon-config.js";

const NO_BUDGET = { dailyUsd: null, weeklyUsd: null };
const USER_SCOPE = { claudeStatusline: "user" };
const ROSEWOOD = { theme: "rosewood", mode: "system" };
const PAGE_MONO = { font: null, size: 13 };

describe("readDaemonConfig", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agn-config-"));
  });

  afterEach(() => rm(home, { recursive: true, force: true }));

  it("has no port, no plans and no editor when the file is missing", async () => {
    expect(await readDaemonConfig(agnosticPaths(home))).toEqual({
      port: null,
      plans: {},
      editor: null,
      catalogCheck: true,
      specWriter: null,
      budget: NO_BUDGET,
      hooks: USER_SCOPE,
      appearance: ROSEWOOD,
      terminal: PAGE_MONO,
    });
  });

  it("reads a port", async () => {
    await writeFile(join(home, "config.yaml"), "port: 7500\n");
    expect(await readDaemonConfig(agnosticPaths(home))).toEqual({
      port: 7500,
      plans: {},
      editor: null,
      catalogCheck: true,
      specWriter: null,
      budget: NO_BUDGET,
      hooks: USER_SCOPE,
      appearance: ROSEWOOD,
      terminal: PAGE_MONO,
    });
  });

  it("reads the editor agn open should use", async () => {
    await writeFile(join(home, "config.yaml"), "editor: cursor\n");
    expect(await readDaemonConfig(agnosticPaths(home))).toMatchObject({ editor: "cursor" });
  });

  it("refuses an editor that is not one of the ids, and names the ones that are", async () => {
    await writeFile(join(home, "config.yaml"), "editor: vim\n");
    const error = await readDaemonConfig(agnosticPaths(home)).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toContain("vscode");
    expect((error as ConfigError).message).toContain("terminal");
    expect((error as ConfigError).code).toBe("ag-file-invalid");
  });

  it("refuses a port outside the range rather than falling back", async () => {
    await writeFile(join(home, "config.yaml"), "port: 99999\n");
    const error = await readDaemonConfig(agnosticPaths(home)).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).code).toBe("ag-file-invalid");
  });

  it("reads the opt-out of the daily catalog check, and refuses anything but a boolean", async () => {
    await writeFile(join(home, "config.yaml"), "catalog_check: false\n");
    expect(await readDaemonConfig(agnosticPaths(home))).toMatchObject({ catalogCheck: false });
    // `off` is YAML's string, not its boolean: a typo must not read as "on".
    await writeFile(join(home, "config.yaml"), "catalog_check: off\n");
    const error = await readDaemonConfig(agnosticPaths(home)).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toContain("catalog_check");
  });

  it("refuses an unknown key", async () => {
    await writeFile(join(home, "config.yaml"), "prot: 7500\n");
    await expect(readDaemonConfig(agnosticPaths(home))).rejects.toThrow(ConfigError);
  });

  it("reads the spend ceiling, and leaves a window the file says nothing about null", async () => {
    await writeFile(join(home, "config.yaml"), "budget:\n  daily_usd: 5\n");
    expect((await readDaemonConfig(agnosticPaths(home))).budget).toEqual({
      dailyUsd: 5,
      weeklyUsd: null,
    });
    await writeFile(join(home, "config.yaml"), "budget:\n  daily_usd: 5\n  weekly_usd: 20\n");
    expect((await readDaemonConfig(agnosticPaths(home))).budget).toEqual({
      dailyUsd: 5,
      weeklyUsd: 20,
    });
  });

  it("has no ceiling when the file does not set one", async () => {
    expect((await readDaemonConfig(agnosticPaths(home))).budget).toEqual({
      dailyUsd: null,
      weeklyUsd: null,
    });
  });

  it("treats an empty budget section as no ceiling, both keys absent", async () => {
    await writeFile(join(home, "config.yaml"), "budget: {}\n");
    expect((await readDaemonConfig(agnosticPaths(home))).budget).toEqual(NO_BUDGET);
  });

  it("refuses a ceiling of zero, a ceiling that is not a number, and a key under it", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "budget:\n  daily_usd: 0\n");
    const zero = await readDaemonConfig(paths).catch((cause: unknown) => cause);
    expect(zero).toBeInstanceOf(ConfigError);
    expect((zero as ConfigError).hint).toContain("delete it");
    await writeFile(paths.config, "budget:\n  daily_usd: five\n");
    await expect(readDaemonConfig(paths)).rejects.toBeInstanceOf(ConfigError);
    await writeFile(paths.config, "budget:\n  daily_usd: 5\n  monthly_usd: 40\n");
    const unknown = await readDaemonConfig(paths).catch((cause: unknown) => cause);
    expect((unknown as ConfigError).message).toContain("monthly_usd");
  });

  it("reads the plan each vendor bills on, and refuses a vendor it does not know", async () => {
    await writeFile(join(home, "config.yaml"), "plans:\n  claude: max20\n  chatgpt: plus\n");
    expect((await readDaemonConfig(agnosticPaths(home))).plans).toEqual({
      claude: "max20",
      chatgpt: "plus",
    });
    // A plan agn has never heard of is the catalog's business, not the parser's.
    await writeFile(join(home, "config.yaml"), "plans:\n  claude: startup\n");
    expect((await readDaemonConfig(agnosticPaths(home))).plans).toEqual({ claude: "startup" });
    await writeFile(join(home, "config.yaml"), "plans:\n  codex: plus\n");
    await expect(readDaemonConfig(agnosticPaths(home))).rejects.toThrow(ConfigError);
  });

  it("reads the profile that writes specs and refuses an id that is not one", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "spec_writer: claude-code:haiku:native\n");
    expect(await readDaemonConfig(paths)).toMatchObject({
      specWriter: "claude-code:haiku:native",
    });
    await writeFile(paths.config, "spec_writer: haiku\n");
    await expect(readDaemonConfig(paths)).rejects.toBeInstanceOf(ConfigError);
  });

  it("reads the status-line scope, and refuses a value that is neither", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "hooks:\n  claude_statusline: repo\n");
    expect((await readDaemonConfig(paths)).hooks).toEqual({ claudeStatusline: "repo" });

    await writeFile(paths.config, "hooks:\n  claude_statusline: both\n");
    await expect(readDaemonConfig(paths)).rejects.toMatchObject({
      hint: "Fix the file, or delete it to use the defaults.",
    });
  });

  it("reads the workspace's theme and mode, and defaults to Rosewood following the system", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "appearance:\n  theme: ink\n  mode: light\n");
    expect((await readDaemonConfig(paths)).appearance).toEqual({ theme: "ink", mode: "light" });

    await writeFile(paths.config, "appearance:\n  theme: ink\n");
    expect((await readDaemonConfig(paths)).appearance).toEqual({ theme: "ink", mode: "system" });
  });

  it("reads the terminal font and size, and defaults to the page's own mono at 13 px", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, 'terminal:\n  font: "IBM Plex Mono"\n  size: 15\n');
    expect((await readDaemonConfig(paths)).terminal).toEqual({ font: "IBM Plex Mono", size: 15 });

    await writeFile(paths.config, "terminal:\n  size: 15\n");
    expect((await readDaemonConfig(paths)).terminal).toEqual({ font: null, size: 15 });
  });

  it("refuses a theme no stylesheet answers to, and a key under appearance nothing reads", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "appearance:\n  theme: midnight\n");
    await expect(readDaemonConfig(paths)).rejects.toBeInstanceOf(ConfigError);

    await writeFile(paths.config, "appearance:\n  colour: ink\n");
    const unknown = await readDaemonConfig(paths).catch((cause: unknown) => cause);
    expect((unknown as ConfigError).message).toContain("colour");
  });
});
