import { EventEmitter } from "node:events";
import type { TerminalSize, TerminalStream } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { bridgeTerminal } from "./terminal-bridge.js";
import { fakeStream, silentLog } from "./test-terminal-fixtures.js";

// Two resize frames in one TCP chunk, which is what a workspace that measures the terminal twice
// on mount sends. `ws` hands both to the listener before the first has opened anything, so this is
// the case `ws.pause()` cannot cover; a second open here would leak a tmux client per reconnect.

/** A duck-typed `ws.WebSocket`, so both frames arrive synchronously as `ws` delivers them. */
class ChunkedSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  sent: string[] = [];
  paused = 0;
  resumed = 0;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
  ping(): void {}
  terminate(): void {}
  pause(): void {
    this.paused += 1;
  }
  resume(): void {
    this.resumed += 1;
  }
  resize(size: TerminalSize): void {
    this.emit("message", Buffer.from(JSON.stringify({ type: "resize", ...size })), false);
  }
}

describe("bridgeTerminal when two frames arrive in one chunk", () => {
  it("opens one stream and resizes it to the second frame's size", async () => {
    const stream = fakeStream();
    const opened: TerminalSize[] = [];
    let settle: (opened: TerminalStream) => void = () => undefined;
    const open = (size: TerminalSize) => {
      opened.push(size);
      return new Promise<TerminalStream>((done) => {
        settle = done;
      });
    };
    const ws = new ChunkedSocket();
    bridgeTerminal({ ws: ws as unknown as WebSocket, taskId: "chunkabcd1", log: silentLog, open });

    ws.resize({ cols: 80, rows: 24 });
    ws.resize({ cols: 120, rows: 40 });
    expect(opened).toEqual([{ cols: 80, rows: 24 }]);

    settle(stream);
    await new Promise((tick) => setImmediate(tick));
    expect(opened).toEqual([{ cols: 80, rows: 24 }]);
    expect(stream.sizes).toEqual([{ cols: 120, rows: 40 }]);
    expect(ws.sent).toEqual([JSON.stringify({ type: "ready" })]);
    expect(ws.resumed).toBe(1);
  });

  it("takes a resize sent after the stream is open as a resize, not a second open", async () => {
    const stream = fakeStream();
    const opened: TerminalSize[] = [];
    const ws = new ChunkedSocket();
    bridgeTerminal({
      ws: ws as unknown as WebSocket,
      taskId: "chunkabcd2",
      log: silentLog,
      open: (size) => {
        opened.push(size);
        return Promise.resolve(stream);
      },
    });

    ws.resize({ cols: 80, rows: 24 });
    await new Promise((tick) => setImmediate(tick));
    ws.resize({ cols: 97, rows: 30 });
    expect(opened).toHaveLength(1);
    expect(stream.sizes).toEqual([{ cols: 97, rows: 30 }]);
  });
});
