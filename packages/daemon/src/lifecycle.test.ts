import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agnosticPaths, isProcessAlive, probeDaemon, readDaemonInfo, spawn } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DaemonError } from "./error.js";
import { daemonStatus, restartDaemon, startDaemon, stopDaemon } from "./lifecycle.js";

// The bin is TypeScript until the package is built, so tests run it through tsx's loader.
const ENTRY = [
  process.execPath,
  "--import",
  "tsx",
  fileURLToPath(new URL("./main.ts", import.meta.url)),
];

let home: string;
let realPath: string | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-life-"));
  realPath = process.env.PATH;
  // The child inherits this PATH, so its detection finds no harness and probes nothing.
  process.env.PATH = dirname(process.execPath);
});

afterEach(async () => {
  const info = await readDaemonInfo(agnosticPaths(home));
  if (info !== null && isProcessAlive(info.pid)) {
    process.kill(info.pid, "SIGKILL");
  }
  process.env.PATH = realPath;
  await rm(home, { recursive: true, force: true });
});

function start(): Promise<{ pid: number; port: number; startedAt: string }> {
  return startDaemon({ home, port: 0, entry: ENTRY });
}

/** A pid that certainly belongs to nobody: one we watched exit. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", ""]);
  const pid = child.pid ?? 0;
  await child;
  return pid;
}

/**
 * Port 1 is the point: an unprivileged process cannot bind it, so the probe these tests make is
 * refused at once and reaches nothing. agn's real port would reach the daemon on this machine,
 * and `restart --force` kills whatever answers the port a stale file names.
 */
const UNREACHABLE_PORT = 1;

async function writeStaleFile(pid: number): Promise<void> {
  await writeFile(
    agnosticPaths(home).daemon,
    JSON.stringify({ pid, port: UNREACHABLE_PORT, startedAt: new Date().toISOString() }),
  );
}

/**
 * A process that answers `/health` as agnd would, with a pid that is alive and is not agn's.
 * `home` is the state directory it claims to serve; without one it is a daemon older than that
 * field, which agn also refuses to touch.
 */
async function foreignDaemon(
  home?: string,
): Promise<{ port: number; pid: number; close(): Promise<void> }> {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => undefined, 60_000)"]);
  const pid = child.pid ?? 0;
  const server = createServer((_request, response) => {
    const body = {
      pid,
      port,
      startedAt: new Date().toISOString(),
      version: "0.0.0-foreign",
      ...(home === undefined ? {} : { home }),
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    pid,
    close: async () => {
      await new Promise<void>((closed) => server.close(() => closed()));
      child.kill("SIGKILL");
      await child.catch(() => undefined);
    },
  };
}

describe("startDaemon", () => {
  it("spawns a daemon that outlives the call and records it in daemon.json", async () => {
    const info = await start();
    expect(info.port).toBeGreaterThan(0);
    expect(isProcessAlive(info.pid)).toBe(true);
    expect(await readDaemonInfo(agnosticPaths(home))).toEqual(info);
    expect((await daemonStatus({ home })).state).toBe("running");
    await stopDaemon({ home });
  }, 20_000);

  it("refuses to start a second daemon over a running one", async () => {
    await start();
    const error = await start().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DaemonError);
    expect((error as DaemonError).code).toBe("daemon-already-running");
    expect((error as DaemonError).hint).toContain("restart");
    await stopDaemon({ home });
  }, 20_000);

  it("starts over a daemon.json whose pid is dead", async () => {
    await writeStaleFile(await deadPid());
    expect((await daemonStatus({ home })).state).toBe("stale");
    const info = await start();
    expect((await readDaemonInfo(agnosticPaths(home)))?.pid).toBe(info.pid);
    await stopDaemon({ home });
  }, 20_000);
});

describe("stopDaemon", () => {
  it("kills the daemon and removes its file", async () => {
    const info = await start();
    await stopDaemon({ home });
    expect(isProcessAlive(info.pid)).toBe(false);
    expect(await readDaemonInfo(agnosticPaths(home))).toBeNull();
    expect((await probeDaemon(agnosticPaths(home))).state).toBe("stopped");
  }, 20_000);

  it("says so when nothing is running", async () => {
    const error = await stopDaemon({ home }).catch((cause: unknown) => cause);
    expect((error as DaemonError).code).toBe("daemon-not-running");
  });
});

describe("restartDaemon", () => {
  it("replaces a running daemon", async () => {
    const first = await start();
    const second = await restartDaemon({ home, port: 0, entry: ENTRY });
    expect(second.pid).not.toBe(first.pid);
    expect(isProcessAlive(first.pid)).toBe(false);
    await stopDaemon({ home });
  }, 30_000);

  it("kills the daemon that is answering, not just the pid in the file", async () => {
    // The file is stale but its port is held by a live daemon: killing only the file's pid would
    // orphan that daemon and leave `start` with a port it cannot bind.
    const live = await start();
    await writeFile(
      agnosticPaths(home).daemon,
      JSON.stringify({
        pid: await deadPid(),
        port: live.port,
        startedAt: new Date().toISOString(),
      }),
    );
    const info = await restartDaemon({ home, port: live.port, force: true, entry: ENTRY });
    expect(isProcessAlive(live.pid)).toBe(false);
    expect(info.pid).not.toBe(live.pid);
    expect(info.port).toBe(live.port);
    expect((await daemonStatus({ home })).state).toBe("running");
    await stopDaemon({ home });
  }, 30_000);

  it("starts over a stale file when forced", async () => {
    await writeStaleFile(await deadPid());
    const info = await restartDaemon({ home, port: 0, force: true, entry: ENTRY });
    expect(isProcessAlive(info.pid)).toBe(true);
    await stopDaemon({ home });
  }, 20_000);
});

describe("daemonStatus", () => {
  it("says stopped when there is no file", async () => {
    expect(await daemonStatus({ home })).toEqual({ state: "stopped", info: null, health: null });
  });

  it("leaves a foreign server answering the port in a stale file alone", async () => {
    // Status is a read. Killing what answers a stale file's port belongs to `restart --force`,
    // and only there, or a stale file in one home ends a daemon serving another. A daemon too
    // old to say which home it serves is foreign for the same reason.
    const foreign = await foreignDaemon();
    try {
      await writeFile(
        agnosticPaths(home).daemon,
        JSON.stringify({
          pid: await deadPid(),
          port: foreign.port,
          startedAt: new Date().toISOString(),
        }),
      );

      const status = await daemonStatus({ home });
      expect(status.state).toBe("foreign");
      expect(status.health?.pid).toBe(foreign.pid);
      expect(isProcessAlive(foreign.pid)).toBe(true);
      expect((await fetch(`http://127.0.0.1:${foreign.port}/health`)).ok).toBe(true);
    } finally {
      await foreign.close();
    }
  }, 20_000);

  it("names the home of a daemon that serves another state directory", async () => {
    const foreign = await foreignDaemon("/tmp/somebody-elses-agnostic-home");
    try {
      await pointDaemonFile(foreign.port, foreign.pid);
      const status = await daemonStatus({ home });
      expect(status.state).toBe("foreign");
      expect(status.health?.home).toBe("/tmp/somebody-elses-agnostic-home");
    } finally {
      await foreign.close();
    }
  }, 20_000);
});

describe("restartDaemon --force against another home", () => {
  it("refuses, names the other home, and leaves that daemon answering", async () => {
    const foreign = await foreignDaemon("/tmp/somebody-elses-agnostic-home");
    try {
      await pointDaemonFile(foreign.port, foreign.pid);
      const error = await restartDaemon({
        home,
        port: foreign.port,
        force: true,
        entry: ENTRY,
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(DaemonError);
      expect((error as DaemonError).code).toBe("daemon-foreign-port");
      expect((error as DaemonError).message).toContain("/tmp/somebody-elses-agnostic-home");
      expect(isProcessAlive(foreign.pid)).toBe(true);
      expect((await fetch(`http://127.0.0.1:${foreign.port}/health`)).ok).toBe(true);
    } finally {
      await foreign.close();
    }
  }, 20_000);

  it("still replaces a daemon that serves this home", async () => {
    const live = await start();
    const info = await restartDaemon({ home, port: live.port, force: true, entry: ENTRY });
    expect(isProcessAlive(live.pid)).toBe(false);
    expect(info.pid).not.toBe(live.pid);
    await stopDaemon({ home });
  }, 30_000);
});

/** daemon.json is a hint: these tests write one that points wherever the case needs it to. */
async function pointDaemonFile(port: number, pid: number): Promise<void> {
  await writeFile(
    agnosticPaths(home).daemon,
    JSON.stringify({ pid, port, startedAt: new Date().toISOString() }),
  );
}
