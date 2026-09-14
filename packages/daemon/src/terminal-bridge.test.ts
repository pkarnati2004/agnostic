import { CoreError, type TerminalSize, type TerminalStream } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { bridgeTerminal } from "./terminal-bridge.js";
import { type FakeStream, fakeStream, silentLog } from "./test-terminal-fixtures.js";

// The bridge against a fake stream: what flows over the socket, with no tmux and no pty anywhere.

let server: WebSocketServer;
let stream: FakeStream;
let opened: TerminalSize[];
let open: (size: TerminalSize) => Promise<TerminalStream>;

beforeEach(async () => {
  stream = fakeStream();
  opened = [];
  open = (size) => {
    opened.push(size);
    return Promise.resolve(stream);
  };
  server = new WebSocketServer({ port: 0 });
  await new Promise((ready) => server.once("listening", ready));
  server.on("connection", (ws) => {
    bridgeTerminal({ ws, taskId: "bridgeabcd", log: silentLog, open: (size) => open(size) });
  });
});

afterEach(async () => {
  // A test that asserted its way to a failure may still hold a socket open, and close waits for it.
  for (const client of server.clients) {
    client.terminate();
  }
  await new Promise((done) => server.close(() => done(undefined)));
});

function connect(): WebSocket {
  const { port } = server.address() as { port: number };
  return new WebSocket(`ws://127.0.0.1:${port}`);
}

/** Every text frame the daemon sent, in order, for a test that asserts on the last one. */
function frames(ws: WebSocket): { text: string[]; binary: Buffer[] } {
  const text: string[] = [];
  const binary: Buffer[] = [];
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      binary.push(data);
    } else {
      text.push(data.toString("utf8"));
    }
  });
  return { text, binary };
}

function opens(ws: WebSocket): Promise<void> {
  return new Promise((ready) => ws.once("open", ready));
}

function closes(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((done) => {
    ws.once("close", (code: number, reason: Buffer) =>
      done({ code, reason: reason.toString("utf8") }),
    );
  });
}

async function until(what: string, check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await new Promise((tick) => setTimeout(tick, 5));
  }
  throw new Error(`${what} did not happen`);
}

describe("bridgeTerminal", () => {
  it("opens the stream at the size of the first frame and answers ready", async () => {
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
    await until("ready arrived", () => seen.text.length > 0);
    expect(opened).toEqual([{ cols: 120, rows: 40 }]);
    expect(seen.text[0]).toBe(JSON.stringify({ type: "ready" }));
    ws.close();
  });

  it("closes a client that sends bytes before it has sent a size", async () => {
    const ws = connect();
    await opens(ws);
    ws.send(Buffer.from("hello", "utf8"));
    expect(await closes(ws)).toEqual({ code: 1008, reason: "request-invalid" });
    expect(opened).toEqual([]);
  });

  it("closes a client whose text frame is not a resize", async () => {
    const ws = connect();
    await opens(ws);
    ws.send(JSON.stringify({ type: "chat", text: "hi" }));
    expect((await closes(ws)).code).toBe(1008);
  });

  it("carries bytes both ways once the stream is open", async () => {
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until("the stream opened", () => seen.text.length > 0);
    ws.send(Buffer.from("héllo ✓\r", "utf8"));
    await until("the bytes reached the stream", () => stream.writes.length > 0);
    expect(stream.writes[0]?.toString("utf8")).toBe("héllo ✓\r");
    stream.emitData("pane says ✓");
    await until("the pane's bytes reached the client", () => seen.binary.length > 0);
    expect(seen.binary[0]?.toString("utf8")).toBe("pane says ✓");
    ws.close();
  });

  it("passes a later resize to the stream instead of opening a second one", async () => {
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until("the stream opened", () => seen.text.length > 0);
    ws.send(JSON.stringify({ type: "resize", cols: 97, rows: 30 }));
    await until("the resize arrived", () => stream.sizes.length > 0);
    expect(stream.sizes).toEqual([{ cols: 97, rows: 30 }]);
    expect(opened).toHaveLength(1);
    ws.close();
  });

  it("sends an exit frame and closes normally when the stream ends", async () => {
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until("the stream opened", () => seen.text.length > 0);
    const ended = closes(ws);
    stream.emitExit(0);
    expect((await ended).code).toBe(1000);
    expect(seen.text.at(-1)).toBe(JSON.stringify({ type: "exit", code: 0 }));
  });

  it("closes the stream exactly once when the client goes away", async () => {
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until("the stream opened", () => seen.text.length > 0);
    ws.close();
    await until("the stream was closed", () => stream.closes > 0);
    await new Promise((settle) => setTimeout(settle, 50));
    expect(stream.closes).toBe(1);
  });

  it("reports a stream that would not open as an exit, with the error's code as the reason", async () => {
    open = () =>
      Promise.reject(
        new CoreError("task bridgeabcd has no session running", { code: "session-not-running" }),
      );
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    expect(await closes(ws)).toEqual({ code: 1011, reason: "session-not-running" });
    expect(seen.text.at(-1)).toBe(JSON.stringify({ type: "exit" }));
  });

  it("closes the stream exactly once when the pty itself exits", async () => {
    const ws = connect();
    const seen = frames(ws);
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 24 }));
    await until("the stream opened", () => seen.text.length > 0);
    const ended = closes(ws);
    stream.emitExit(0);
    await ended;
    // The socket's own close event follows the exit-triggered ws.close(); it must not double-close.
    await new Promise((settle) => setTimeout(settle, 50));
    expect(stream.closes).toBe(1);
  });

  it("rejects a resize below the schema's minimum and closes 1008", async () => {
    const ws = connect();
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 0, rows: 24 }));
    expect((await closes(ws)).code).toBe(1008);
    expect(opened).toEqual([]);
  });

  it("rejects a resize above the schema's maximum and closes 1008", async () => {
    const ws = connect();
    await opens(ws);
    ws.send(JSON.stringify({ type: "resize", cols: 80, rows: 1001 }));
    expect((await closes(ws)).code).toBe(1008);
    expect(opened).toEqual([]);
  });
});
