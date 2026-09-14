import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgnosticPaths,
  agnosticPaths,
  type DaemonClient,
  type DaemonInfo,
  ProcessError,
  type ProcessOptions,
  type spawn,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMain } from "../program.js";
import { createTestContext } from "../test-context.js";
import { uiCommand } from "./ui.js";

const TOKEN = "9f86d081884c7d659a2feaa0c55ad015";
const PORT = 45_231;

type Spawned = { command: string; args: string[]; opts: ProcessOptions };

let home: string;
let paths: AgnosticPaths;

/** A state directory a daemon has already written to: the port to open and the token to carry. */
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-ui-cli-"));
  paths = agnosticPaths(home);
  await mkdir(home, { recursive: true });
  const info: DaemonInfo = { pid: process.pid, port: PORT, startedAt: new Date().toISOString() };
  await writeFile(paths.daemon, JSON.stringify(info), "utf8");
  await writeFile(paths.authToken, `${TOKEN}\n`, { mode: 0o600 });
});

afterEach(() => rm(home, { recursive: true, force: true }));

/** `exit` is what the fake browser opener does when agn starts it. */
function cli(exit: "now" | { rejects: unknown } = "now") {
  const spawned: Spawned[] = [];
  const fakeSpawn = ((command: string, args: string[] = [], opts: ProcessOptions = {}) => {
    spawned.push({ command, args, opts });
    const settled =
      exit === "now" ? Promise.resolve({ exitCode: 0 }) : Promise.reject(exit.rejects);
    return Object.assign(settled, { unref: () => undefined }) as unknown as ReturnType<
      typeof spawn
    >;
  }) as typeof spawn;
  const test = createTestContext({ paths, spawn: fakeSpawn, client: {} });
  return { ...test, spawned };
}

describe("agn ui", () => {
  it("prints the tokenised address with --no-open, and starts nothing", async () => {
    const test = cli();
    await uiCommand(test.ctx, "darwin").parseAsync(["--no-open"], { from: "user" });
    expect(test.out).toEqual([`http://127.0.0.1:${PORT}/ui#token=${TOKEN}`]);
    expect(test.spawned).toEqual([]);
  });

  it("reads the port from daemon.json only after ctx.client() resolves, naming the daemon that just started (ADR 012)", async () => {
    const test = cli();
    const startedPort = 45_999;
    // Stand in for auto-start: the real ctx.client() rewrites daemon.json before it resolves.
    test.ctx.client = async () => {
      const info: DaemonInfo = {
        pid: process.pid,
        port: startedPort,
        startedAt: new Date().toISOString(),
      };
      await writeFile(paths.daemon, JSON.stringify(info), "utf8");
      return {} as DaemonClient;
    };
    await uiCommand(test.ctx, "darwin").parseAsync(["--no-open"], { from: "user" });
    expect(test.out).toEqual([`http://127.0.0.1:${startedPort}/ui#token=${TOKEN}`]);
  });

  it("hands the tokenised address to the platform opener and prints the plain one", async () => {
    const test = cli();
    await uiCommand(test.ctx, "darwin").parseAsync([], { from: "user" });
    expect(test.spawned).toHaveLength(1);
    expect(test.spawned[0]?.command).toBe("open");
    expect(test.spawned[0]?.args).toEqual([`http://127.0.0.1:${PORT}/ui#token=${TOKEN}`]);
    expect(test.spawned[0]?.opts.detached).toBe(true);
    expect(test.spawned[0]?.opts.logFile).toBe(join(home, "logs", "agn-ui.log"));
    expect(test.out).toEqual([`opened http://127.0.0.1:${PORT}/ui`]);
    expect(test.out.join("\n")).not.toContain(TOKEN);
  });

  it("uses xdg-open anywhere but macOS", async () => {
    const test = cli();
    await uiCommand(test.ctx, "linux").parseAsync([], { from: "user" });
    expect(test.spawned[0]?.command).toBe("xdg-open");
  });

  it("says how to open it by hand when the opener fails, without repeating the token", async () => {
    const test = cli({
      rejects: new ProcessError(`Command failed: open http://127.0.0.1:${PORT}/ui#token=${TOKEN}`, {
        code: "process-failed",
        command: "open",
        args: [`http://127.0.0.1:${PORT}/ui#token=${TOKEN}`],
        exitCode: 1,
        stderr: "",
      }),
    });
    const code = await runMain(["node", "agn", "ui"], test.ctx);
    expect(code).toBe(1);
    expect(test.err.join("\n")).toContain("agn ui --no-open");
    expect(test.err.join("\n")).not.toContain(TOKEN);
    expect(test.out).toEqual([]);
  });

  it("is a usage error with --json: there is no body to print", async () => {
    const test = cli();
    const code = await runMain(["node", "agn", "ui", "--json"], test.ctx);
    expect(code).toBe(2);
    expect(test.err.join("\n")).toContain("--json is not supported");
    expect(test.spawned).toEqual([]);
  });

  it("says to start the daemon when no daemon.json names a port", async () => {
    await rm(paths.daemon);
    const test = cli();
    const code = await runMain(["node", "agn", "ui", "--no-open"], test.ctx);
    expect(code).toBe(1);
    expect(test.err.join("\n")).toContain("agn daemon start");
    expect(test.spawned).toEqual([]);
  });
});
