import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, ConfigError } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDaemonConfig, writeDaemonConfigPlans } from "./daemon-config.js";

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
});

describe("writeDaemonConfigPlans", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agn-config-"));
  });

  afterEach(() => rm(home, { recursive: true, force: true }));

  it("keeps the port, the editor and the vendor the user did not mention", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "port: 7500\neditor: cursor\nplans:\n  chatgpt: plus\n");
    expect(await writeDaemonConfigPlans(paths, { claude: "max20" })).toEqual({
      claude: "max20",
      chatgpt: "plus",
    });
    expect(await readDaemonConfig(paths)).toEqual({
      port: 7500,
      editor: "cursor",
      plans: { claude: "max20", chatgpt: "plus" },
      catalogCheck: true,
      specWriter: null,
    });
  });

  it("writes a file that was not there", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfigPlans(paths, { claude: "pro" });
    expect(await readDaemonConfig(paths)).toEqual({
      port: null,
      editor: null,
      plans: { claude: "pro" },
      catalogCheck: true,
      specWriter: null,
    });
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

  it("keeps the spec writer when agn doctor --plan rewrites the file", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "spec_writer: claude-code:haiku:native\n");
    await writeDaemonConfigPlans(paths, { claude: "pro" });
    expect(await readDaemonConfig(paths)).toMatchObject({
      specWriter: "claude-code:haiku:native",
      plans: { claude: "pro" },
    });
  });

  it("keeps an opted-out daily catalog check", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "catalog_check: false\n");
    await writeDaemonConfigPlans(paths, { claude: "pro" });
    expect(await readDaemonConfig(paths)).toMatchObject({ catalogCheck: false });
  });
});
