import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExecutorProvider, SessionHandle, TerminalStream } from "@agnostic/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTmuxExecutor } from "./executor.js";
import { createTestTmux, type TestTmux, waitFor } from "./test-tmux.js";
import { killSession, listSessions, parsePaneValue, type TmuxClient } from "./tmux-client.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let tmux: TestTmux;
let executor: ExecutorProvider;

beforeAll(async () => {
  tmux = await createTestTmux();
  executor = await tmux.executor();
});

afterAll(async () => {
  await tmux.cleanup();
});

async function startAgent(taskId: string): Promise<{ handle: SessionHandle; log: string }> {
  const cwd = await mkdtemp(join(tmpdir(), "agn-terminal-"));
  const log = join(cwd, "agent.log");
  const handle = await executor.launch({
    taskId,
    cwd,
    command: { command: FAKE_AGENT, args: ["--log", log], env: tmux.env, promptAfterStart: null },
  });
  await waitFor("the agent is ready", async () => (await logText(log)).includes("ready"));
  return { handle, log };
}

function logText(log: string): Promise<string> {
  return readFile(log, "utf8").catch(() => "");
}

/** Everything the pane has sent this client so far, decoded once at the end. */
function collect(stream: TerminalStream): () => string {
  const chunks: Uint8Array[] = [];
  stream.onData((data) => chunks.push(data));
  return () => Buffer.concat(chunks).toString("utf8");
}

function type(stream: TerminalStream, text: string): void {
  stream.write(Buffer.from(text, "utf8"));
}

async function paneWidth(client: TmuxClient, session: string): Promise<number | null> {
  const result = await client.run(
    ["list-panes", "-s", "-t", session, "-F", "#{session_name}|#{pane_width}"],
    { allowFailure: true },
  );
  const width = result.exitCode === 0 ? parsePaneValue(result.stdout) : null;
  return width === null ? null : Number(width);
}

async function clientCount(client: TmuxClient, session: string): Promise<number> {
  const result = await client.run(["list-clients", "-t", session, "-F", "#{client_tty}"], {
    allowFailure: true,
  });
  if (result.exitCode !== 0) {
    return 0;
  }
  return result.stdout.split("\n").filter((line) => line.trim() !== "").length;
}

describe("terminal", () => {
  it("attaches a client that redraws the pane at the size it asked for", async () => {
    const { handle } = await startAgent("termreadyx");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const seen = collect(stream);
    try {
      await waitFor("the attach redraw arrives", () => seen().includes("fake-agent ready"));
      expect(await clientCount(tmux.client, handle.tmuxSession)).toBe(1);
      await waitFor(
        "the pane takes the client's width",
        async () => (await paneWidth(tmux.client, handle.tmuxSession)) === 120,
        3_000,
      );
    } finally {
      stream.close();
    }
  });

  it("carries bytes both ways, including characters outside ASCII", async () => {
    const { handle, log } = await startAgent("termtypexy");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const seen = collect(stream);
    try {
      await waitFor("the attach redraw arrives", () => seen().includes("fake-agent ready"));
      type(stream, "hello\r");
      await waitFor("the agent reads the line", async () =>
        (await logText(log)).includes("line: hello"),
      );
      type(stream, "héllo ✓\r");
      await waitFor("the agent reads the non-ASCII line", async () =>
        (await logText(log)).includes("line: héllo ✓"),
      );
      await waitFor("the pane echoes it back unmangled", () => seen().includes("héllo ✓"));
    } finally {
      stream.close();
    }
  });

  it("resizes the pane, and the client that resized last wins", async () => {
    const { handle } = await startAgent("termsizexy");
    const wide = await executor.terminal(handle, { cols: 120, rows: 40 });
    const narrow = await executor.terminal(handle, { cols: 80, rows: 24 });
    const widthIs = (cols: number) => async () =>
      (await paneWidth(tmux.client, handle.tmuxSession)) === cols;
    try {
      await waitFor("the newest client's 80 columns win", widthIs(80), 3_000);
      wide.resize({ cols: 97, rows: 30 });
      await waitFor("the resized client's 97 columns win", widthIs(97), 3_000);
      narrow.resize({ cols: 80, rows: 30 });
      await waitFor("80 wins again", widthIs(80), 3_000);
      // The rows change too, so the kernel really signals the client rather than skipping a no-op.
      wide.resize({ cols: 97, rows: 40 });
      await waitFor("and 97 once more", widthIs(97), 3_000);
    } finally {
      wide.close();
      narrow.close();
    }
  });

  it("close ends that client only, and is idempotent", async () => {
    const { handle, log } = await startAgent("termclosex");
    const closed = await executor.terminal(handle, { cols: 120, rows: 40 });
    const other = await executor.terminal(handle, { cols: 120, rows: 40 });
    const exits: number[] = [];
    closed.onExit((code) => exits.push(code));
    try {
      await waitFor("both clients are attached", async () => {
        return (await clientCount(tmux.client, handle.tmuxSession)) === 2;
      });
      closed.close();
      closed.close();
      await waitFor(
        "one client is left",
        async () => (await clientCount(tmux.client, handle.tmuxSession)) === 1,
        2_000,
      );
      expect(exits).toHaveLength(1);
      expect(typeof exits[0]).toBe("number");
      expect(await executor.sessionState(handle)).toBe("running");
      // A client leaving must not reach the harness: no TERM, no EOF on its stdin.
      const lines = (await logText(log)).split("\n");
      expect(lines).not.toContain("term");
      expect(lines).not.toContain("eof");
      type(other, "still\r");
      await waitFor("the surviving client still types into the pane", async () =>
        (await logText(log)).includes("line: still"),
      );
    } finally {
      other.close();
    }
  });

  it("ends the stream when the session is killed", async () => {
    const { handle } = await startAgent("termkillxy");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const exit = nextExit(stream);
    await killSession(tmux.client, handle.tmuxSession);
    expect(typeof (await exit)).toBe("number");
  });

  it("ends the stream when the executor stops the task", async () => {
    const { handle } = await startAgent("termstopxy");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const exit = nextExit(stream);
    await executor.stop(handle);
    expect(typeof (await exit)).toBe("number");
  });

  it("stops delivering data to a listener once it unsubscribes", async () => {
    const { handle, log } = await startAgent("termunsubxy");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const early: Uint8Array[] = [];
    const late: Uint8Array[] = [];
    const unsubscribeEarly = stream.onData((data) => early.push(data));
    stream.onData((data) => late.push(data));
    try {
      await waitFor(
        "both listeners see the attach redraw",
        () => early.length > 0 && late.length > 0,
      );
      unsubscribeEarly();
      const earlyCountAtUnsubscribe = early.length;
      type(stream, "afterunsub\r");
      await waitFor("the still-subscribed listener sees the new line", async () =>
        (await logText(log)).includes("line: afterunsub"),
      );
      // The unsubscribed listener never grows again, even though the pane kept sending data.
      expect(early.length).toBe(earlyCountAtUnsubscribe);
      expect(late.length).toBeGreaterThan(0);
    } finally {
      stream.close();
    }
  });

  it("does not throw writing after close, and the write never reaches the pane", async () => {
    const { handle, log } = await startAgent("termwafterxy");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    await waitFor(
      "the client is attached",
      async () => (await clientCount(tmux.client, handle.tmuxSession)) === 1,
    );
    const exit = nextExit(stream);
    stream.close();
    await exit;
    expect(() => stream.write(Buffer.from("toolate\r"))).not.toThrow();
    // Give the harness a moment it does not need: there is nothing in flight to arrive late.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await logText(log)).includes("toolate")).toBe(false);
  });

  it("fires onExit exactly once, and a listener added after exit never fires", async () => {
    const { handle } = await startAgent("termoncexy");
    const stream = await executor.terminal(handle, { cols: 120, rows: 40 });
    const exits: number[] = [];
    stream.onExit((code) => exits.push(code));
    await killSession(tmux.client, handle.tmuxSession);
    await waitFor("the exit fires", () => exits.length > 0);
    // Node-pty's onExit fires once per client; nothing else can push another exit onto the pane.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(exits).toHaveLength(1);
    let lateFired = false;
    stream.onExit(() => {
      lateFired = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(lateFired).toBe(false);
  });

  it("refuses a handle whose session is not running", async () => {
    const handle: SessionHandle = {
      taskId: "termgonexy",
      tmuxSession: "agn-termgonexy",
      tmuxSocket: tmux.socketName,
      launchId: null,
      cwd: "/tmp",
    };
    await expect(executor.terminal(handle, { cols: 80, rows: 24 })).rejects.toMatchObject({
      name: "ExecutorError",
      code: "session-not-running",
    });
  });
});

function nextExit(stream: TerminalStream): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the stream never exited")), 5_000);
    stream.onExit((code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("executor.close", () => {
  it("ends every open stream and leaves the session running", async () => {
    const { handle } = await startAgent("termdownxy");
    // Its own executor on the same socket: closing the shared one would stop the other tests.
    const doomed = await createTmuxExecutor({
      paths: { ...tmux.paths, sessions: join(tmux.home, "sessions-terminal-close") },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    const stream = await doomed.terminal(handle, { cols: 120, rows: 40 });
    const exit = nextExit(stream);
    await doomed.close();
    expect(typeof (await exit)).toBe("number");
    expect(await listSessions(tmux.client)).toContain(handle.tmuxSession);
    await killSession(tmux.client, handle.tmuxSession);
  });

  it("is a no-op the second time, with no open stream left to end", async () => {
    const { handle } = await startAgent("termdown2xy");
    const doomed = await createTmuxExecutor({
      paths: { ...tmux.paths, sessions: join(tmux.home, "sessions-terminal-close2") },
      socketName: tmux.socketName,
      env: tmux.env,
    });
    const stream = await doomed.terminal(handle, { cols: 120, rows: 40 });
    const exit = nextExit(stream);
    await doomed.close();
    await exit;
    await expect(doomed.close()).resolves.toBeUndefined();
    expect(await listSessions(tmux.client)).toContain(handle.tmuxSession);
    await killSession(tmux.client, handle.tmuxSession);
  });
});
