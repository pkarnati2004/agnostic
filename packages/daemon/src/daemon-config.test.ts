import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, ConfigError } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDaemonConfig } from "./daemon-config.js";

describe("readDaemonConfig", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "agn-config-"));
  });

  afterEach(() => rm(home, { recursive: true, force: true }));

  it("has no port when the file is missing", async () => {
    expect(await readDaemonConfig(agnosticPaths(home))).toEqual({ port: null });
  });

  it("reads a port", async () => {
    await writeFile(join(home, "config.yaml"), "port: 7500\n");
    expect(await readDaemonConfig(agnosticPaths(home))).toEqual({ port: 7500 });
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
});
