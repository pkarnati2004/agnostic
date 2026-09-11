import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ExecutorProvider,
  isProcessAlive,
  type LaunchRequest,
  type SessionEvent,
} from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProcessProbe } from "./process-table.js";
import { survivors } from "./stop.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";
import { hasSession } from "./tmux-client.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let tmux: TestTmux;
let executor: ExecutorProvider;
let sequence = 0;
// One listener for the whole file: an exit nobody is waiting for still has somewhere to land.
const seen: SessionEvent[] = [];

beforeAll(async () => {
  tmux = await createTestTmux();
  executor = tmux.executor();
  executor.onEvent((event) => seen.push(event));
});

afterAll(async () => {
  await tmux.cleanup();
});

async function exitOf(session: string, timeoutMs = 10_000): Promise<SessionEvent> {
  await waitFor(`${session} reports its exit`, () => matching(session).length > 0, timeoutMs);
  return matching(session)[0] as SessionEvent;
}

function matching(session: string): SessionEvent[] {
  return seen.filter((event) => event.tmuxSession === session);
}

async function request(extra: string[] = []): Promise<LaunchRequest & { log: string }> {
  sequence += 1;
  const cwd = await mkdtemp(join(tmpdir(), "agn-stop-"));
  const log = join(cwd, "agent.log");
  return {
    taskId: `stop${sequence}wxyz`.slice(0, 10),
    cwd,
    log,
    command: {
      command: FAKE_AGENT,
      args: ["--log", log, ...extra],
      env: tmux.env,
      promptAfterStart: null,
    },
  };
}

describe("stop", () => {
  it("ends a harness that takes SIGTERM, and the exit is still reported once", async () => {
    const req = await request();
    const handle = await executor.launch(req);
    await waitFor("the agent is ready", async () =>
      (await readFile(req.log, "utf8").catch(() => "")).includes("ready"),
    );
    const started = Date.now();
    await executor.stop(handle);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await exitOf(handle.tmuxSession)).toMatchObject({ exitCode: 143 });
    expect(matching(handle.tmuxSession)).toHaveLength(1);
    expect(await readFile(req.log, "utf8")).toContain("term");
    expect(await hasSession(tmux.client, handle.tmuxSession)).toBe(false);
  });

  it("kills the process group, so a child the harness started goes too", async () => {
    const req = await request();
    const handle = await executor.launch(req);
    await tmux.client.run(["send-keys", "-t", handle.tmuxSession, "spawn", "Enter"]);
    await waitFor("the child is started", async () =>
      (await readFile(req.log, "utf8").catch(() => "")).includes("spawned"),
    );
    const child = Number(/spawned (\d+)/.exec(await readFile(req.log, "utf8"))?.[1]);
    expect(isProcessAlive(child)).toBe(true);
    await executor.stop(handle);
    await waitFor("the child is gone", () => !isProcessAlive(child));
  });

  it("escalates to SIGKILL for a harness that ignores SIGTERM", async () => {
    const req = await request(["--ignore-term"]);
    const handle = await executor.launch(req);
    await waitFor("the agent is ready", async () =>
      (await readFile(req.log, "utf8").catch(() => "")).includes("ready"),
    );
    await executor.stop(handle);
    // Killed by a signal: tmux has no exit status to report.
    expect(await exitOf(handle.tmuxSession, 15_000)).toMatchObject({ exitCode: null });
    expect(await readFile(req.log, "utf8")).not.toContain("term");
  }, 40_000);

  it("resolves at once for a session that is not there, and can be called twice", async () => {
    const handle = {
      taskId: "stopnobody",
      tmuxSession: "agn-stopnobody",
      tmuxSocket: tmux.socketName,
      cwd: tmux.home,
    };
    await expect(executor.stop(handle)).resolves.toBeUndefined();
    const req = await request();
    const live = await executor.launch(req);
    await executor.stop(live);
    await expect(executor.stop(live)).resolves.toBeUndefined();
  });
});

describe("survivors", () => {
  function probeWith(comms: Map<number, string | null>, alive: number[]): ProcessProbe {
    return {
      descendants: async () => [],
      comm: async (pid) => comms.get(pid) ?? null,
      alive: (pid) => alive.includes(pid),
      signal: () => undefined,
    };
  }

  it("skips a pid that has been recycled into another program", async () => {
    const captured = new Map<number, string | null>([
      [100, "claude"],
      [101, "node"],
    ]);
    const now = probeWith(
      new Map<number, string | null>([
        [100, "claude"],
        [101, "Safari"],
      ]),
      [100, 101],
    );
    expect(await survivors([100, 101], captured, now)).toEqual([100]);
  });

  it("skips a pid that is already dead", async () => {
    const captured = new Map<number, string | null>([[100, "claude"]]);
    expect(await survivors([100], captured, probeWith(captured, []))).toEqual([]);
  });
});
