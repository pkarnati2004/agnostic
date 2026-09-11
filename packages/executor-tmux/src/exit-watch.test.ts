import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutorProvider, LaunchRequest, SessionEvent } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExecutorError } from "./error.js";
import { createTmuxExecutor } from "./executor.js";
import { createExitWatch, parseExitStatus } from "./exit-watch.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";
import { hasSession, panePid, type TmuxClient } from "./tmux-client.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let tmux: TestTmux;
let executor: ExecutorProvider;
let sequence = 0;

beforeAll(async () => {
  tmux = await createTestTmux();
  executor = tmux.executor();
});

afterAll(async () => {
  await tmux.cleanup();
});

async function request(args: string[]): Promise<LaunchRequest> {
  sequence += 1;
  const cwd = await mkdtemp(join(tmpdir(), "agn-exit-"));
  return {
    taskId: `exit${sequence}wxyz`.slice(0, 10),
    cwd,
    command: { command: FAKE_AGENT, args, env: tmux.env, promptAfterStart: null },
  };
}

function collect(provider: ExecutorProvider): { events: SessionEvent[]; off: () => void } {
  const events: SessionEvent[] = [];
  return { events, off: provider.onEvent((event) => events.push(event)) };
}

describe("parseExitStatus", () => {
  it("reads the status, and calls a signal death unknown", () => {
    expect(parseExitStatus("0 \n")).toBe(0);
    expect(parseExitStatus("3 \n")).toBe(3);
    expect(parseExitStatus(" kill\n")).toBeNull();
    expect(parseExitStatus("\n")).toBeNull();
  });
});

describe("the exit watcher", () => {
  it("reports a clean exit, kills the dead session and removes the file", async () => {
    const req = await request(["--exit-after", "1"]);
    const handle = await executor.launch(req);
    const { events, off } = collect(executor);
    await waitFor("the exit is reported", () => events.length > 0, 10_000);
    off();
    expect(events[0]).toMatchObject({
      kind: "exited",
      taskId: req.taskId,
      tmuxSession: handle.tmuxSession,
      exitCode: 0,
    });
    expect(Date.parse(events[0]?.at ?? "")).toBeGreaterThan(0);
    expect(await hasSession(tmux.client, handle.tmuxSession)).toBe(false);
    await expect(
      stat(join(tmux.paths.sessions, `${handle.tmuxSession}.exit`)),
    ).rejects.toThrowError();
  });

  it("carries the harness's own exit code", async () => {
    const req = await request([]);
    const handle = await executor.launch(req);
    const { events, off } = collect(executor);
    await tmux.client.run(["send-keys", "-t", handle.tmuxSession, "crash", "Enter"]);
    await waitFor("the crash is reported", () => events.length > 0, 10_000);
    off();
    expect(events[0]?.exitCode).toBe(3);
  });

  it("has no exit code when a signal ended the harness", async () => {
    const req = await request([]);
    const handle = await executor.launch(req);
    const { events, off } = collect(executor);
    const pid = await panePid(tmux.client, handle.tmuxSession);
    process.kill(pid ?? 0, "SIGKILL");
    await waitFor("the kill is reported", () => events.length > 0, 10_000);
    off();
    expect(events[0]).toMatchObject({ tmuxSession: handle.tmuxSession, exitCode: null });
  });

  it("reads an exit that happened while nothing was watching", async () => {
    const sessions = join(tmux.home, "sessions-downtime");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(sessions, "agn-exitdowntm.exit"), "7 \n");
    const restarted = createTmuxExecutor({
      paths: { ...tmux.paths, sessions },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    const { events } = collect(restarted);
    await waitFor("the exit from before the restart is reported", () => events.length > 0);
    expect(events[0]).toMatchObject({ taskId: "exitdowntm", exitCode: 7 });
    await restarted.close();
  });

  it("emits nothing once it is closed", async () => {
    // Its own sessions directory, so the exit it waits for can only come from this executor.
    const sessions = join(tmux.home, "sessions-closed");
    const closed = createTmuxExecutor({
      paths: { ...tmux.paths, sessions },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    const { events } = collect(closed);
    const req = await request(["--exit-after", "1"]);
    const handle = await closed.launch(req);
    await closed.close();
    await waitFor(
      "the harness exits and its hook writes the file",
      () =>
        stat(join(sessions, `${handle.tmuxSession}.exit`)).then(
          () => true,
          () => false,
        ),
      10_000,
    );
    expect(events).toEqual([]);
  });

  it("stops delivering to a listener that unsubscribed", async () => {
    const own = createTmuxExecutor({
      paths: { ...tmux.paths, sessions: join(tmux.home, "sessions-unsubscribed") },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    const gone = collect(own);
    gone.off();
    const req = await request(["--exit-after", "1"]);
    const handle = await own.launch(req);
    const listening = collect(own);
    await waitFor("the exit reaches the live listener", () => listening.events.length > 0, 10_000);
    expect(listening.events[0]?.tmuxSession).toBe(handle.tmuxSession);
    expect(gone.events).toEqual([]);
    await own.close();
  });
});

describe("a tmux that cannot be reached", () => {
  it("still reports the exit once, unlinks the file, and keeps reading later ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agn-exit-unreachable-"));
    const unreachable: TmuxClient = {
      socket: "agn-unreachable",
      run: () =>
        Promise.reject(new ExecutorError("tmux is not installed", { code: "tmux-not-found" })),
    };
    const events: SessionEvent[] = [];
    const watcher = createExitWatch(unreachable, dir, (event) => events.push(event));

    await writeFile(join(dir, "agn-unreachab1.exit"), "0 \n");
    await watcher.scan();
    expect(events).toHaveLength(1);
    await expect(stat(join(dir, "agn-unreachab1.exit"))).rejects.toThrowError();

    // The kill that failed must not have poisoned the queue: the next exit is still reported.
    await writeFile(join(dir, "agn-unreachab2.exit"), "2 \n");
    await watcher.scan();
    expect(events.map((event) => event.exitCode)).toEqual([0, 2]);
    await expect(watcher.close()).resolves.toBeUndefined();
  });
});
