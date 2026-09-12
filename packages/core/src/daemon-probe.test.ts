import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { probeDaemon, readAuthToken, readDaemonInfo } from "./daemon-probe.js";
import { DaemonApiError } from "./error.js";
import { agnosticPaths } from "./paths.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-probe-"));
});

afterEach(() => rm(home, { recursive: true, force: true }));

/** Just enough of a daemon to answer /health with whatever the test wants it to say. */
async function stubDaemon(body: unknown): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

describe("readAuthToken", () => {
  it("trims the file", async () => {
    const paths = agnosticPaths(home);
    await writeFile(paths.authToken, "  abcdef0123  \n");
    expect(await readAuthToken(paths)).toBe("abcdef0123");
  });

  it("says how to create the token when it is missing", async () => {
    const error = await readAuthToken(agnosticPaths(home)).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DaemonApiError);
    expect((error as DaemonApiError).code).toBe("auth-token-missing");
    expect((error as DaemonApiError).hint).toContain("agn daemon start");
    expect((error as DaemonApiError).status).toBeNull();
  });
});

describe("readDaemonInfo", () => {
  it("is null when the file is missing or is not daemon.json", async () => {
    const paths = agnosticPaths(home);
    expect(await readDaemonInfo(paths)).toBeNull();
    await writeFile(paths.daemon, "not json at all");
    expect(await readDaemonInfo(paths)).toBeNull();
    await writeFile(paths.daemon, JSON.stringify({ pid: "many", port: 1 }));
    expect(await readDaemonInfo(paths)).toBeNull();
  });

  it("reads a well-formed file", async () => {
    const paths = agnosticPaths(home);
    const info = { pid: 42, port: 7431, startedAt: "2026-09-11T10:00:00.000Z" };
    await writeFile(paths.daemon, JSON.stringify(info));
    expect(await readDaemonInfo(paths)).toEqual(info);
  });
});

describe("probeDaemon", () => {
  it("is stopped with no file", async () => {
    expect(await probeDaemon(agnosticPaths(home))).toEqual({
      state: "stopped",
      info: null,
      health: null,
    });
  });

  it("is stale when the port does not answer", async () => {
    const paths = agnosticPaths(home);
    await writeFile(
      paths.daemon,
      JSON.stringify({ pid: process.pid, port: 1, startedAt: new Date().toISOString() }),
    );
    const probe = await probeDaemon(paths, 200);
    expect(probe.state).toBe("stale");
    expect(probe.health).toBeNull();
  });

  it("is stale when the daemon answering is a different process", async () => {
    const daemon = await stubDaemon({
      pid: process.pid + 1,
      port: 1,
      startedAt: new Date().toISOString(),
      version: "0",
    });
    const paths = agnosticPaths(home);
    const port = Number(daemon.baseUrl.split(":").pop());
    await writeFile(
      paths.daemon,
      JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }),
    );
    expect((await probeDaemon(paths)).state).toBe("stale");
    await daemon.close();
  });
});
