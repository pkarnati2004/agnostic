import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDaemonConfig } from "./daemon-config.js";
import { writeDaemonConfig } from "./daemon-config-write.js";

const NO_BUDGET = { dailyUsd: null, weeklyUsd: null };
const USER_SCOPE = { claudeStatusline: "user" };
const ROSEWOOD = { theme: "rosewood", mode: "system" };
const PAGE_MONO = { font: null, size: 13 };

describe("writeDaemonConfig", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agn-config-write-"));
  });

  afterEach(() => rm(home, { recursive: true, force: true }));

  it("keeps the port, the editor and the vendor the user did not mention", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "port: 7500\neditor: cursor\nplans:\n  chatgpt: plus\n");
    expect((await writeDaemonConfig(paths, { plans: { claude: "max20" } })).plans).toEqual({
      claude: "max20",
      chatgpt: "plus",
    });
    expect(await readDaemonConfig(paths)).toEqual({
      port: 7500,
      editor: "cursor",
      plans: { claude: "max20", chatgpt: "plus" },
      catalogCheck: true,
      specWriter: null,
      budget: NO_BUDGET,
      hooks: USER_SCOPE,
      appearance: ROSEWOOD,
      terminal: PAGE_MONO,
    });
  });

  it("writes a file that was not there", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfig(paths, { plans: { claude: "pro" } });
    expect(await readDaemonConfig(paths)).toMatchObject({
      port: null,
      editor: null,
      plans: { claude: "pro" },
      appearance: ROSEWOOD,
    });
  });

  it("keeps the header line, so the file still says what wrote it", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfig(paths, { appearance: { theme: "ink" } });
    expect(await readFile(paths.config, "utf8")).toMatch(/^# agn machine settings\./);
  });

  it("clears a key the patch sets to null and keeps one it leaves out", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "editor: cursor\nbudget:\n  daily_usd: 5\n  weekly_usd: 20\n");
    await writeDaemonConfig(paths, { budget: { dailyUsd: null } });
    expect(await readDaemonConfig(paths)).toMatchObject({
      editor: "cursor",
      budget: { dailyUsd: null, weeklyUsd: 20 },
    });

    await writeDaemonConfig(paths, { editor: null });
    expect(await readDaemonConfig(paths)).toMatchObject({ editor: null });
  });

  it("writes no key that is already at its default", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfig(paths, { appearance: { theme: "rosewood", mode: "system" } });
    // The header names the plans section, so the body is what is asked here, not the whole file.
    const body = (await readFile(paths.config, "utf8")).split("\n").slice(1).join("\n");
    expect(body).not.toContain("appearance");
    expect(body).not.toContain("terminal");
    expect(body).not.toContain("budget");
    expect(body).not.toContain("claude_statusline");
    expect(body).not.toContain("plans");
  });

  it("keeps the plans through an appearance write, and the theme through a plans write", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfig(paths, { plans: { claude: "pro" } });
    await writeDaemonConfig(paths, { appearance: { theme: "slate" } });
    expect(await readDaemonConfig(paths)).toMatchObject({
      plans: { claude: "pro" },
      appearance: { theme: "slate", mode: "system" },
    });

    await writeDaemonConfig(paths, { plans: { chatgpt: "plus" } });
    expect(await readDaemonConfig(paths)).toMatchObject({
      plans: { claude: "pro", chatgpt: "plus" },
      appearance: { theme: "slate", mode: "system" },
    });
  });

  it("round-trips a terminal font with a space in its name", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfig(paths, { terminal: { font: "IBM Plex Mono", size: 14 } });
    expect((await readDaemonConfig(paths)).terminal).toEqual({ font: "IBM Plex Mono", size: 14 });

    await writeDaemonConfig(paths, { terminal: { font: null } });
    expect((await readDaemonConfig(paths)).terminal).toEqual({ font: null, size: 14 });
  });

  it("keeps the spec writer, the ceiling, the catalog opt-out and the scope through a plans write", async () => {
    const paths = agnosticPaths(home);
    await writeFile(
      paths.config,
      [
        "spec_writer: claude-code:haiku:native",
        "catalog_check: false",
        "budget:",
        "  daily_usd: 5",
        "  weekly_usd: 20",
        "hooks:",
        "  claude_statusline: repo",
        "",
      ].join("\n"),
    );
    await writeDaemonConfig(paths, { plans: { claude: "pro" } });
    expect(await readDaemonConfig(paths)).toMatchObject({
      specWriter: "claude-code:haiku:native",
      catalogCheck: false,
      budget: { dailyUsd: 5, weeklyUsd: 20 },
      hooks: { claudeStatusline: "repo" },
      plans: { claude: "pro" },
    });
  });

  it("answers the merged config, which is what the route sends back", async () => {
    const paths = agnosticPaths(home);
    const config = await writeDaemonConfig(paths, { terminal: { size: 16 } });
    expect(config.terminal).toEqual({ font: null, size: 16 });
    expect(config).toEqual(await readDaemonConfig(paths));
  });
});
