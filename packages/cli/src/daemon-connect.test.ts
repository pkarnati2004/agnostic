import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgnosticPaths, agnosticPaths, type DaemonInfo } from "@agnostic/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Output } from "./context.js";
import { connect } from "./daemon-connect.js";
import type { DaemonEntry, DaemonRun } from "./daemon-entry.js";
import { stubEntry } from "./test-context.js";

const ENTRY: DaemonEntry = { argv: [process.execPath, "/not/run/in/this/test"] };

function home(): AgnosticPaths {
  const paths = agnosticPaths(mkdtempSync(join(tmpdir(), "agn-connect-")));
  writeFileSync(paths.authToken, "token-abc\n");
  return paths;
}

function markRunning(paths: AgnosticPaths, port: number): DaemonInfo {
  const info: DaemonInfo = { pid: process.pid, port, startedAt: new Date().toISOString() };
  writeFileSync(paths.daemon, JSON.stringify(info));
  // probeDaemon calls /health with the global fetch; this process's own pid is the live one, and
  // the home it answers with is this one, or the probe would call it another home's daemon.
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response(JSON.stringify({ ...info, version: "0.0.0", home: paths.home }))),
  );
  return info;
}

function markStale(paths: AgnosticPaths): void {
  // A pid this high is not a live process, so probeDaemon calls it stale without ever fetching.
  const info: DaemonInfo = { pid: 999_999, port: 7433, startedAt: new Date().toISOString() };
  writeFileSync(paths.daemon, JSON.stringify(info));
}

function collect(): Output & { lines: string[] } {
  const lines: string[] = [];
  return { lines, out: (line) => lines.push(line), err: (line) => lines.push(line) };
}

/** Unlike `collect`, keeps stdout and stderr apart so a test can prove a line went to only one. */
function split(): { io: Output; outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    io: { out: (line) => outLines.push(line), err: (line) => errLines.push(line) },
    outLines,
    errLines,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("connect", () => {
  it("starts nothing when the daemon is already answering", async () => {
    const paths = home();
    markRunning(paths, 7431);
    const run = vi.fn<() => Promise<DaemonRun>>();
    const client = await connect({ paths, entry: ENTRY, io: collect(), run });
    expect(run).not.toHaveBeenCalled();
    expect(await client.health()).toMatchObject({ pid: process.pid, port: 7431 });
  });

  it("starts the daemon once, re-probes, and says so on stderr", async () => {
    const paths = home();
    const io = collect();
    const run = vi.fn(async (_entry: DaemonEntry, args: string[]): Promise<DaemonRun> => {
      expect(args).toEqual(["start"]);
      markRunning(paths, 7432);
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    await connect({ paths, entry: ENTRY, io, run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(io.lines).toEqual(["agn: started the daemon on port 7432"]);
  });

  it("repeats the reason the daemon bin gave and names the log file", async () => {
    const paths = home();
    vi.stubEnv("AGND_STUB_EXIT", "1");
    vi.stubEnv("AGND_STUB_STDERR", "agnd: listen EADDRINUSE 127.0.0.1:7431");
    await expect(connect({ paths, entry: stubEntry(), io: collect() })).rejects.toMatchObject({
      code: "daemon-start-failed",
      message: "the agn daemon could not be started\nagnd: listen EADDRINUSE 127.0.0.1:7431",
      hint: `See ${join(paths.logs, "agnd.log")} or run \`agn daemon start\`.`,
    });
  });

  it("treats a daemon.json with a dead pid as stale and starts a new one", async () => {
    const paths = home();
    markStale(paths);
    const run = vi.fn(async (_entry: DaemonEntry, args: string[]): Promise<DaemonRun> => {
      expect(args).toEqual(["start"]);
      markRunning(paths, 7434);
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const client = await connect({ paths, entry: ENTRY, io: collect(), run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await client.health()).toMatchObject({ port: 7434 });
  });

  it("reads the auth token only after the daemon has started, not before", async () => {
    // No token on disk yet: reading it before start would fail even though start succeeds.
    const paths = agnosticPaths(mkdtempSync(join(tmpdir(), "agn-connect-")));
    const run = vi.fn(async (): Promise<DaemonRun> => {
      writeFileSync(paths.authToken, "token-from-start\n");
      markRunning(paths, 7435);
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const client = await connect({ paths, entry: ENTRY, io: collect(), run });
    await expect(client.health()).resolves.toMatchObject({ port: 7435 });
  });

  it("puts the started line on stderr and nothing on stdout", async () => {
    const paths = home();
    const io = split();
    const run = async (): Promise<DaemonRun> => {
      markRunning(paths, 7436);
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    await connect({ paths, entry: ENTRY, io: io.io, run });
    expect(io.outLines).toEqual([]);
    expect(io.errLines).toEqual(["agn: started the daemon on port 7436"]);
  });

  it("names the log file when the real stub entry never brings a daemon up", async () => {
    const paths = home();
    // No `run` override: this spawns the fixture stub script for real, which exits 0 without
    // ever writing daemon.json, so the re-probe still finds nothing running.
    await expect(connect({ paths, entry: stubEntry(), io: collect() })).rejects.toMatchObject({
      code: "daemon-start-failed",
      hint: `See ${join(paths.logs, "agnd.log")} or run \`agn daemon start\`.`,
    });
  });
});
