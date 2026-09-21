import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureTmuxConfig, tmuxConfig } from "./tmux-config.js";

let home: string;
let bin: string;
let savedPath: string | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-tmux-config-"));
  bin = await mkdtemp(join(tmpdir(), "agn-tmux-config-bin-"));
  savedPath = process.env.PATH;
});

afterEach(async () => {
  process.env.PATH = savedPath;
  await rm(home, { recursive: true, force: true });
  await rm(bin, { recursive: true, force: true });
});

/** The only infocmp on PATH, so the terminal name is this test's choice and not the machine's. */
async function shimInfocmp(exitCode: number): Promise<void> {
  const shim = join(bin, "infocmp");
  await writeFile(shim, `#!/bin/sh\nexit ${exitCode}\n`, "utf8");
  await chmod(shim, 0o755);
  process.env.PATH = bin;
}

async function writtenConfig(): Promise<string> {
  const paths = agnosticPaths(home);
  const written = await ensureTmuxConfig(paths);
  expect(written).toBe(paths.tmuxConf);
  return await readFile(written, "utf8");
}

describe("ensureTmuxConfig", () => {
  it("writes the four settings under the state directory and returns that path", async () => {
    await shimInfocmp(0);
    const text = await writtenConfig();
    expect(text).toContain('set -g default-terminal "tmux-256color"');
    expect(text).toContain("set -s escape-time 0");
    expect(text).toContain("set -g status off");
    expect(text).toContain("set -g mouse on");
    expect(agnosticPaths(home).tmuxConf).toBe(join(home, "tmux.conf"));
  });

  it("records a marker for the settings, so doctor can spot a server that predates them", async () => {
    await shimInfocmp(0);
    const marker = /^set -g @agn-config (\S+)$/m.exec(await writtenConfig())?.[1];
    expect(marker).toMatch(/^[0-9a-f]{12}$/);
    expect(tmuxConfig("screen-256color")).not.toContain(marker);
  });

  it("falls back to screen-256color when terminfo has no tmux-256color entry", async () => {
    await shimInfocmp(1);
    expect(await writtenConfig()).toBe(tmuxConfig("screen-256color"));
  });

  it("falls back to screen-256color when there is no infocmp to ask", async () => {
    process.env.PATH = bin;
    expect(await writtenConfig()).toBe(tmuxConfig("screen-256color"));
  });

  it("rewrites a file that was changed since agn last wrote it", async () => {
    await shimInfocmp(0);
    const paths = agnosticPaths(home);
    await ensureTmuxConfig(paths);
    await writeFile(paths.tmuxConf, "set -g no-such-option 1\n", "utf8");
    await ensureTmuxConfig(paths);
    expect(await readFile(paths.tmuxConf, "utf8")).toBe(tmuxConfig("tmux-256color"));
  });
});
