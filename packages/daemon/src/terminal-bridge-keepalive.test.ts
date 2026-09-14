import { EventEmitter } from "node:events";
import type { TerminalStream } from "@agnostic/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { bridgeTerminal } from "./terminal-bridge.js";
import { silentLog } from "./test-terminal-fixtures.js";

// The ping/pong keepalive on fake timers, split out of terminal-bridge.test.ts so neither file
// grows past the line limit. A half-open socket would otherwise hold its tmux client for the
// daemon's life (ADR 025 risk 4), and nothing here waits on a real 30s clock.

/** A duck-typed `ws.WebSocket`: only what `bridgeTerminal`'s heartbeat touches, on fake timers. */
class FakePingSocket extends EventEmitter {
  readyState = WebSocket.OPEN;
  pings = 0;
  terminated = 0;
  send(): void {}
  ping(): void {
    this.pings += 1;
  }
  terminate(): void {
    this.terminated += 1;
  }
  pause(): void {}
  resume(): void {}
}

/** No frame is ever sent in these tests, so the bridge never calls `open`. */
const neverOpens = (): Promise<TerminalStream> => Promise.reject(new Error("not used"));

describe("bridgeTerminal's keepalive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates a socket that never answers a ping", async () => {
    vi.useFakeTimers();
    const fake = new FakePingSocket();
    bridgeTerminal({
      ws: fake as unknown as WebSocket,
      taskId: "pingabcd01",
      log: silentLog,
      open: neverOpens,
    });
    expect(fake.pings).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fake.pings).toBe(1);
    expect(fake.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fake.terminated).toBe(1);
  });

  it("keeps a socket that answers every ping with a pong", async () => {
    vi.useFakeTimers();
    const fake = new FakePingSocket();
    bridgeTerminal({
      ws: fake as unknown as WebSocket,
      taskId: "pingabcd02",
      log: silentLog,
      open: neverOpens,
    });
    for (let round = 0; round < 3; round += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
      fake.emit("pong");
    }
    expect(fake.pings).toBe(3);
    expect(fake.terminated).toBe(0);
  });
});
