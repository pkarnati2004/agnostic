import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function writeStaleFile(pid: number): Promise<void> {
  await writeFile(
    agnosticPaths(home).daemon,
    JSON.stringify({ pid, port: 7431, startedAt: new Date().toISOString() }),
  );
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
});
