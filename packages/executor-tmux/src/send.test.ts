import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutorProvider, LaunchRequest, RunResult, SessionHandle } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendText } from "./send.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";
import type { TmuxClient } from "./tmux-client.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let tmux: TestTmux;
let executor: ExecutorProvider;
let sequence = 0;

beforeAll(async () => {
  tmux = await createTestTmux();
  executor = await tmux.executor();
});

afterAll(async () => {
  await tmux.cleanup();
});

function taskId(): string {
  sequence += 1;
  return `send${sequence}wxyz`.slice(0, 10);
}

async function request(extra: string[] = []): Promise<LaunchRequest & { log: string }> {
  const cwd = await mkdtemp(join(tmpdir(), "agn-send-"));
  const log = join(cwd, "agent.log");
  return {
    taskId: taskId(),
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

async function launched(extra: string[] = []): Promise<{ handle: SessionHandle; log: string }> {
  const req = await request(extra);
  const handle = await executor.launch(req);
  await waitFor("the agent is ready", async () =>
    (await readFile(req.log, "utf8").catch(() => "")).includes("ready"),
  );
  return { handle, log: req.log };
}

function logOf(log: string): Promise<string> {
  return readFile(log, "utf8").catch(() => "");
}

/** A bracketed paste wraps the buffer in escape codes the fake agent's `read -r` keeps on the
 * line, so a sent line is read for the text it carries rather than matched verbatim. */
function loggedLine(log: string, text: string): boolean {
  return log.split("\n").some((line) => line.startsWith("line: ") && line.includes(text));
}

/** A client that answers instead of running tmux: a live pane holding the given screen. */
function paneShowing(screen: string): TmuxClient {
  return {
    socket: "agn-recording",
    async run(args: string[]): Promise<RunResult> {
      const stdout = args[0] === "capture-pane" ? screen : "agn-recorded|0";
      return { stdout, stderr: "", exitCode: 0, durationMs: 0 };
    },
  };
}

function fakeHandle(session: string): SessionHandle {
  return {
    taskId: "sendfake1",
    tmuxSession: session,
    tmuxSocket: "agn-recording",
    launchId: null,
    cwd: tmux.home,
  };
}

describe("sendText", () => {
  it("exposes send on the provider the way the interface adds it", () => {
    expect(typeof executor.send).toBe("function");
  });

  it("pastes the text into the running session and the agent logs the line", async () => {
    const { handle, log } = await launched();
    await executor.send(handle, "hello there");
    await waitFor("the agent logs the sent line", async () =>
      loggedLine(await logOf(log), "hello there"),
    );
  });

  it("delivers a two-line text as two lines, in order", async () => {
    const { handle, log } = await launched();
    await sendText(tmux.client, handle, "first line\nsecond line");
    await waitFor("the second line arrives", async () =>
      loggedLine(await logOf(log), "second line"),
    );
    const lines = (await logOf(log)).split("\n").filter((line) => line.startsWith("line: "));
    const first = lines.findIndex((line) => line.includes("first line"));
    const second = lines.findIndex((line) => line.includes("second line"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
  });

  it("refuses a session that has been stopped", async () => {
    const { handle } = await launched();
    await executor.stop(handle);
    await expect(sendText(tmux.client, handle, "hello")).rejects.toMatchObject({
      name: "ExecutorError",
      code: "session-not-running",
    });
  });

  it("refuses a handle whose session never existed", async () => {
    const ghost: SessionHandle = {
      taskId: "sendnobody",
      tmuxSession: "agn-sendnobody",
      tmuxSocket: tmux.socketName,
      launchId: null,
      cwd: tmux.home,
    };
    await expect(sendText(tmux.client, ghost, "hello")).rejects.toMatchObject({
      name: "ExecutorError",
      code: "session-not-running",
    });
  });

  it("types nothing while the pane shows a screen the user has to answer", async () => {
    // The fake agent prints its prompt argument, so the pane holds a trust screen's own wording.
    const { handle, log } = await launched(["Do you trust the contents of this directory?"]);
    await waitFor("the screen is drawn", async () =>
      (await logOf(log)).includes("Do you trust the contents of this directory"),
    );

    await expect(sendText(tmux.client, handle, "hello")).rejects.toMatchObject({
      name: "ExecutorError",
      code: "agent-not-ready",
    });
    expect(loggedLine(await logOf(log), "hello")).toBe(false);
  });

  it("refuses a pane whose process has already died", async () => {
    const { handle, log } = await launched(["--exit-after", "1"]);
    await waitFor("the pane dies", async () => (await logOf(log)).includes("idle"));
    await expect(sendText(tmux.client, handle, "hello")).rejects.toMatchObject({
      name: "ExecutorError",
      code: "session-not-running",
    });
  });
});

describe("sendText's debug line", () => {
  it("says what it refused and why, then types nothing", async () => {
    const lines: string[] = [];
    const client = paneShowing("Hooks need review\n> Trust all and continue");
    await expect(
      sendText(client, fakeHandle("agn-gated"), "hello", (message, fields) => {
        lines.push(`${message} ${JSON.stringify(fields)}`);
      }),
    ).rejects.toMatchObject({ code: "agent-not-ready" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("typed nothing");
    expect(lines[0]).toContain("Hooks need review");
  });
});
