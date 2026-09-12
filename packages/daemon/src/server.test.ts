import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { agnosticPaths, probeDaemon, readDaemonInfo } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DaemonError } from "./error.js";
import { runDaemon } from "./server.js";

let home: string;
let realPath: string | undefined;
let realCatalogUrl: string | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-server-"));
  realPath = process.env.PATH;
  realCatalogUrl = process.env.AGNOSTIC_CATALOG_URL;
  // Detection runs at start; with only node's own bin on PATH it finds no harness to probe.
  process.env.PATH = dirname(process.execPath);
});

afterEach(async () => {
  process.env.PATH = realPath;
  if (realCatalogUrl === undefined) {
    delete process.env.AGNOSTIC_CATALOG_URL;
  } else {
    process.env.AGNOSTIC_CATALOG_URL = realCatalogUrl;
  }
  await rm(home, { recursive: true, force: true });
});

function holdPort(): Promise<{ port: number; release(): Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        port,
        release: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe("runDaemon", () => {
  it("binds loopback, writes daemon.json and answers /health", async () => {
    const daemon = await runDaemon({ home, port: 0 });
    const paths = agnosticPaths(home);
    const info = await readDaemonInfo(paths);
    expect(info).toMatchObject({ pid: process.pid, port: daemon.port });
    expect((await probeDaemon(paths)).state).toBe("running");
    await daemon.close();
  });

  it("creates the auth token and the log file", async () => {
    const daemon = await runDaemon({ home, port: 0 });
    const paths = agnosticPaths(home);
    expect((await stat(paths.authToken)).mode & 0o777).toBe(0o600);
    expect((await stat(join(paths.logs, "agnd.log"))).isFile()).toBe(true);
    await daemon.close();
  });

  it("removes daemon.json when it closes", async () => {
    const daemon = await runDaemon({ home, port: 0 });
    await daemon.close();
    expect(await readDaemonInfo(agnosticPaths(home))).toBeNull();
    expect((await probeDaemon(agnosticPaths(home))).state).toBe("stopped");
  });

  it("names the port when something else already holds it", async () => {
    const held = await holdPort();
    const error = await runDaemon({ home, port: held.port }).catch((cause: unknown) => cause);
    await held.release();
    expect(error).toBeInstanceOf(DaemonError);
    expect((error as DaemonError).code).toBe("port-in-use");
    expect((error as DaemonError).message).toContain(String(held.port));
    expect((error as DaemonError).hint).toContain("config.yaml");
  });

  it("refuses a bad AGNOSTIC_CATALOG_URL before it opens the ledger", async () => {
    process.env.AGNOSTIC_CATALOG_URL = "ftp://catalog.test";
    const error = await runDaemon({ home, port: 0 }).catch((cause: unknown) => cause);
    expect((error as Error).message).toContain("AGNOSTIC_CATALOG_URL");
    await expect(stat(agnosticPaths(home).db)).rejects.toThrow();
  });

  it("takes the port from config.yaml when no port is given", async () => {
    const held = await holdPort();
    await held.release();
    await writeFile(join(home, "config.yaml"), `port: ${held.port}\n`);
    const daemon = await runDaemon({ home });
    expect(daemon.port).toBe(held.port);
    await daemon.close();
  });
});
