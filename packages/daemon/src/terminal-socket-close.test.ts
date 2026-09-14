import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { closeOrTerminate } from "./terminal-socket.js";

// Shutdown against a client that never answers the close handshake. `ws` would hold that socket
// for 30 s, and `agnd stop` waits on `server.close`, so the cut is what keeps the stop quick.

/** A duck-typed `ws.WebSocket`: only what the shutdown path touches. */
class FrozenSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  codes: number[] = [];
  terminated = 0;
  /** A frozen tab takes the close frame and never replies, so no close event follows. */
  close(code: number): void {
    this.codes.push(code);
  }
  terminate(): void {
    this.terminated += 1;
    this.readyState = WebSocket.CLOSED;
    this.emit("close", 1006, Buffer.alloc(0));
  }
}

/** A client that answers at once, which is every browser that is still running. */
class PoliteSocket extends FrozenSocket {
  override close(code: number): void {
    super.close(code);
    this.readyState = WebSocket.CLOSED;
    this.emit("close", code, Buffer.alloc(0));
  }
}

describe("closeOrTerminate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cuts a socket that never answers the close handshake, within a second", async () => {
    vi.useFakeTimers();
    const frozen = new FrozenSocket();
    const closed = new Promise<number>((done) => frozen.once("close", done));

    closeOrTerminate(frozen as unknown as WebSocket);
    expect(frozen.codes).toEqual([1001]);
    expect(frozen.terminated).toBe(0);

    await vi.advanceTimersByTimeAsync(999);
    expect(frozen.terminated).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(frozen.terminated).toBe(1);
    expect(await closed).toBe(1006);

    // The timer is cleared by the close it caused: no second cut, and nothing left ticking.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(frozen.terminated).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves a socket that closes on its own alone", async () => {
    vi.useFakeTimers();
    const polite = new PoliteSocket();
    closeOrTerminate(polite as unknown as WebSocket);
    expect(polite.codes).toEqual([1001]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(polite.terminated).toBe(0);
  });
});
