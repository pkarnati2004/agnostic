import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agnosticPaths, type DaemonInfo, type DaemonProbe, type spawn } from "@agnostic/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { daemonArgv, daemonEnv, ensureDaemon, stopDaemon } from "./daemon-launch.js";

const INFO: DaemonInfo = { pid: 4242, port: 7555, startedAt: "2026-11-01T00:00:00.000Z" };

const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

function tempPaths() {
  const home = mkdtempSync(join(tmpdir(), "agn-desktop-launch-"));
  homes.push(home);
  return agnosticPaths(home);
}

function probes(...states: DaemonProbe[]) {
  let index = 0;
  return vi.fn(async (): Promise<DaemonProbe> => {
    const state = states[Math.min(index, states.length - 1)];
    index += 1;
    if (state === undefined) {
      throw new Error("no probe answer");
    }
    return state;
  });
}

const RUNNING: DaemonProbe = { state: "running", info: INFO, health: null };
const STOPPED: DaemonProbe = { state: "stopped", info: null, health: null };

function fakeSpawn() {
  const child = { unref: vi.fn(), catch: vi.fn() };
  const fake = vi.fn(() => child as unknown as ReturnType<typeof spawn>);
  return { fake: fake as unknown as typeof spawn & typeof fake, child };
}

describe("daemonArgv and daemonEnv", () => {
  it("runs the bundle's agnd under the given binary", () => {
    expect(daemonArgv("/App/Resources/app", "/App/MacOS/agnostic")).toEqual([
      "/App/MacOS/agnostic",
      "/App/Resources/app/agnd/agnd.js",
      "run",
    ]);
  });

  it("adds ELECTRON_RUN_AS_NODE and AGNOSTIC_HOME to the shell's env", () => {
    expect(daemonEnv({ PATH: "/usr/bin", AGNOSTIC_HOME: "/old" }, "/new")).toEqual({
      PATH: "/usr/bin",
      ELECTRON_RUN_AS_NODE: "1",
      AGNOSTIC_HOME: "/new",
    });
  });
});

describe("ensureDaemon", () => {
  const argv = ["/App/MacOS/agnostic", "/app/agnd/agnd.js", "run"];
  const env = { PATH: "/usr/bin", ELECTRON_RUN_AS_NODE: "1" };

  it("reuses a running daemon and spawns nothing", async () => {
    const { fake } = fakeSpawn();
    const result = await ensureDaemon({
      paths: tempPaths(),
      argv,
      env,
      probe: probes(RUNNING),
      spawn: fake,
    });
    expect(result).toEqual({ kind: "running", info: INFO, reused: true });
    expect(fake).not.toHaveBeenCalled();
  });

  it("spawns one detached daemon with only the given env, then waits for it", async () => {
    const { fake, child } = fakeSpawn();
    const paths = tempPaths();
    const probe = probes(STOPPED, STOPPED, RUNNING);
    const result = await ensureDaemon({ paths, argv, env, probe, spawn: fake });
    expect(result).toEqual({ kind: "running", info: INFO, reused: false });
    expect(fake).toHaveBeenCalledOnce();
    expect(fake).toHaveBeenCalledWith("/App/MacOS/agnostic", ["/app/agnd/agnd.js", "run"], {
      detached: true,
      inheritEnv: false,
      env,
      logFile: join(paths.logs, "agnd.log"),
    });
    expect(child.unref).toHaveBeenCalled();
    expect(fake).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: "1" }) }),
    );
  });

  it("removes a stale daemon.json before the spawn", async () => {
    const paths = tempPaths();
    writeFileSync(paths.daemon, JSON.stringify(INFO));
    let fileAtSpawn: boolean | null = null;
    const { fake } = fakeSpawn();
    fake.mockImplementation((() => {
      fileAtSpawn = existsSync(paths.daemon);
      return { unref: vi.fn(), catch: vi.fn() };
    }) as never);
    const stale: DaemonProbe = { state: "stale", info: INFO, health: null };
    await ensureDaemon({ paths, argv, env, probe: probes(stale, RUNNING), spawn: fake });
    expect(fileAtSpawn).toBe(false);
  });

  it("reports a port held for another home and spawns nothing", async () => {
    const { fake } = fakeSpawn();
    const foreign: DaemonProbe = {
      state: "foreign",
      info: INFO,
      health: { ...INFO, pid: 1, version: "0.1.0", home: "/Users/other/.agnostic" },
    };
    const result = await ensureDaemon({
      paths: tempPaths(),
      argv,
      env,
      probe: probes(foreign),
      spawn: fake,
    });
    expect(result).toEqual({ kind: "foreign", home: "/Users/other/.agnostic", port: 7555 });
    expect(fake).not.toHaveBeenCalled();
  });

  it("gives up after waitMs with the log file to read", async () => {
    const { fake } = fakeSpawn();
    const paths = tempPaths();
    const started = Date.now();
    const result = await ensureDaemon({
      paths,
      argv,
      env,
      probe: probes(STOPPED),
      spawn: fake,
      waitMs: 250,
    });
    expect(result).toEqual({ kind: "failed", logFile: join(paths.logs, "agnd.log") });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("ensureDaemon with the real probe", () => {
  let server: Server | null = null;

  afterEach(async () => {
    const open = server;
    server = null;
    await new Promise<void>((done) => (open === null ? done() : open.close(() => done())));
  });

  it("reuses the daemon that daemon.json names, without spawning", async () => {
    const paths = tempPaths();
    const listening = createServer((_request, response) => {
      const { port } = listening.address() as AddressInfo;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          pid: process.pid,
          port,
          startedAt: INFO.startedAt,
          version: "0.0.0",
          home: paths.home,
        }),
      );
    });
    server = listening;
    await new Promise<void>((done) => listening.listen(0, "127.0.0.1", done));
    const { port } = listening.address() as AddressInfo;
    mkdirSync(paths.home, { recursive: true });
    writeFileSync(paths.daemon, JSON.stringify({ ...INFO, pid: process.pid, port }));
    const { fake } = fakeSpawn();
    const result = await ensureDaemon({
      paths,
      argv: ["/App/MacOS/agnostic", "/app/agnd/agnd.js", "run"],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      spawn: fake,
    });
    expect(result).toMatchObject({ kind: "running", reused: true, info: { port } });
    expect(fake).not.toHaveBeenCalled();
  });
});

describe("stopDaemon", () => {
  it("runs the bundle's agnd stop with only the given env", async () => {
    const run = vi.fn(async () => ({
      stdout: "agnd stopped",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    }));
    const env = { ELECTRON_RUN_AS_NODE: "1", AGNOSTIC_HOME: "/h" };
    await stopDaemon({ appRoot: "/app", env, run });
    expect(run).toHaveBeenCalledWith(process.execPath, ["/app/agnd/agnd.js", "stop"], {
      env,
      inheritEnv: false,
    });
  });
});
