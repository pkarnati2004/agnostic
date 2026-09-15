import type { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { type Task, TERMINAL_TOKEN_PROTOCOL } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import type { DaemonContext } from "./app.js";
import { createTerminalSocket } from "./terminal-socket.js";
import { silentLog } from "./test-terminal-fixtures.js";

// A client that drops between the upgrade request and the handshake. The checks in between await
// tmux, so the raw socket spends that window as nobody's: an ECONNRESET with no listener on it is
// an uncaught exception, and the daemon would exit with every terminal that lost its network.

const TOKEN = "0123456789abcdef";

/** A fake `Duplex`: the upgrade path only ever writes to it and destroys it. */
class FakeSocket extends Duplex {
  written = "";
  override _read(): void {}
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.written += chunk.toString("utf8");
    done();
  }
}

function upgradeRequest(id: string): IncomingMessage {
  return {
    url: `/tasks/${id}/terminal`,
    headers: { "sec-websocket-protocol": `${TERMINAL_TOKEN_PROTOCOL}${TOKEN}` },
  } as IncomingMessage;
}

/** Only what the upgrade path reads, with `reconcile` held open so the window stays open. */
function context(reconcile: Promise<Task>): DaemonContext {
  const task = { id: "dropabcd01" } as Task;
  return {
    token: TOKEN,
    log: silentLog,
    port: () => 7431,
    ledger: { tasks: { get: () => task } },
    lifecycle: { reconcile: () => reconcile },
    executor: { sessionState: () => Promise.resolve("running") },
  } as unknown as DaemonContext;
}

describe("the terminal socket's upgrade window", () => {
  it("destroys a socket that errors while the task is being checked, without throwing", async () => {
    let ready: (task: Task) => void = () => undefined;
    const reconcile = new Promise<Task>((done) => {
      ready = done;
    });
    const sockets = createTerminalSocket(context(reconcile));
    const socket = new FakeSocket();

    sockets.upgrade(upgradeRequest("dropabcd01"), socket, Buffer.alloc(0));
    expect(() => socket.emit("error", new Error("read ECONNRESET"))).not.toThrow();
    expect(socket.destroyed).toBe(true);

    // The checks finish on a socket that is already gone; the refusal they write must not throw
    // either, and `ws` must never be handed a dead socket.
    ready({ id: "dropabcd01" } as Task);
    await new Promise((tick) => setTimeout(tick, 10));
    expect(socket.written).toBe("");
    sockets.close();
  });

  it("refuses a live socket on an unknown path with a plain HTTP answer", () => {
    const sockets = createTerminalSocket(context(Promise.resolve({ id: "dropabcd01" } as Task)));
    const socket = new FakeSocket();
    sockets.upgrade(
      { url: "/tasks/dropabcd01/terminals", headers: {} } as IncomingMessage,
      socket,
      Buffer.alloc(0),
    );
    expect(socket.written).toContain("HTTP/1.1 404 Not Found");
    expect(socket.destroyed).toBe(true);
    sockets.close();
  });
});
