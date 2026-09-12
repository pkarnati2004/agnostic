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

  it("has no port when the file is missing", async () => {
    expect(await readDaemonConfig(agnosticPaths(home))).toEqual({ port: null, plans: {} });
  });

  it("reads a port", async () => {
    await writeFile(join(home, "config.yaml"), "port: 7500\n");
    expect(await readDaemonConfig(agnosticPaths(home))).toEqual({ port: 7500, plans: {} });
  });

  it("refuses a port outside the range rather than falling back", async () => {
    await writeFile(join(home, "config.yaml"), "port: 99999\n");
    const error = await readDaemonConfig(agnosticPaths(home)).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).code).toBe("ag-file-invalid");
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

  it("keeps the port and the vendor the user did not mention", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.config, "port: 7500\nplans:\n  chatgpt: plus\n");
    expect(await writeDaemonConfigPlans(paths, { claude: "max20" })).toEqual({
      claude: "max20",
      chatgpt: "plus",
    });
    expect(await readDaemonConfig(paths)).toEqual({
      port: 7500,
      plans: { claude: "max20", chatgpt: "plus" },
    });
  });

  it("writes a file that was not there", async () => {
    const paths = agnosticPaths(home);
    await writeDaemonConfigPlans(paths, { claude: "pro" });
    expect(await readDaemonConfig(paths)).toEqual({ port: null, plans: { claude: "pro" } });
  });
});
