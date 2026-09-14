import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloseContext } from "./close-notice";
import { connectTerminal, type TerminalSocketEvents } from "./terminal-socket";

/** Enough of a WebSocket for the client above, plus the handles a test needs to drive it. */
class FakeSocket {
  static last: FakeSocket | null = null;
  readonly sent: unknown[] = [];
  readonly closeCodes: number[] = [];
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.last = this;
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code: number): void {
    this.closeCodes.push(code);
  }

  opened(): void {
    this.onopen?.();
  }

  received(data: unknown): void {
    this.onmessage?.({ data });
  }

  ended(code: number, reason = ""): void {
    this.onclose?.({ code, reason });
  }
}

const FakeWebSocket = FakeSocket as unknown as typeof WebSocket;

function events(): TerminalSocketEvents & { closes: CloseContext[]; data: Uint8Array[] } {
  return {
    closes: [],
    data: [],
    onReady: vi.fn(),
    onExit: vi.fn(),
    onData(bytes) {
      this.data.push(bytes);
    },
    onClose(ctx) {
      this.closes.push(ctx);
    },
  };
}

function connect(handlers: TerminalSocketEvents, protocol = "http:") {
  const connection = connectTerminal({
    taskId: "t1",
    token: "sekret",
    size: { cols: 120, rows: 40 },
    events: handlers,
    WebSocket: FakeWebSocket,
    page: { protocol, host: "127.0.0.1:7431" },
  });
  const socket = FakeSocket.last;
  if (socket === null) {
    throw new Error("the client opened no socket");
  }
  return { connection, socket };
}

beforeEach(() => {
  FakeSocket.last = null;
});

describe("connectTerminal", () => {
  it("carries the token as the subprotocol", () => {
    const { socket } = connect(events());
    expect(socket.url).toBe("ws://127.0.0.1:7431/tasks/t1/terminal");
    expect(socket.protocols).toEqual(["agn-token.sekret"]);
    expect(socket.binaryType).toBe("arraybuffer");
  });

  it("speaks wss when the page arrived over TLS", () => {
    const { socket } = connect(events(), "https:");
    expect(socket.url).toBe("wss://127.0.0.1:7431/tasks/t1/terminal");
  });

  it("sends the size before anything else, then what was typed while it opened", () => {
    const { connection, socket } = connect(events());
    connection.write(new Uint8Array([104, 105]));
    expect(socket.sent).toEqual([]);
    socket.opened();
    expect(socket.sent[0]).toBe('{"type":"resize","cols":120,"rows":40}');
    expect(socket.sent[1]).toEqual(new Uint8Array([104, 105]));
  });

  it("sends the newest size when the pane moved before the socket opened", () => {
    const { connection, socket } = connect(events());
    connection.resize({ cols: 97, rows: 30 });
    socket.opened();
    expect(socket.sent).toEqual(['{"type":"resize","cols":97,"rows":30}']);
  });

  it("reports ready, bytes and the exit", () => {
    const handlers = events();
    const { socket } = connect(handlers);
    socket.opened();
    socket.received('{"type":"ready"}');
    expect(handlers.onReady).toHaveBeenCalledOnce();
    socket.received(new Uint8Array([1, 2, 3]).buffer);
    expect(handlers.data).toEqual([new Uint8Array([1, 2, 3])]);
    socket.received('{"type":"exit","code":0}');
    socket.ended(1000);
    expect(handlers.onExit).toHaveBeenCalledWith(0);
    expect(handlers.closes).toEqual([{ code: 1000, reason: "", sawExit: true }]);
  });

  it("reports a close the daemon never explained", () => {
    const handlers = events();
    const { socket } = connect(handlers);
    socket.opened();
    socket.ended(1006);
    expect(handlers.closes).toEqual([{ code: 1006, reason: "", sawExit: false }]);
  });

  it("sends a resize only when the size changed", () => {
    const { connection, socket } = connect(events());
    socket.opened();
    connection.resize({ cols: 120, rows: 40 });
    expect(socket.sent).toHaveLength(1);
    connection.resize({ cols: 121, rows: 40 });
    expect(socket.sent).toHaveLength(2);
  });

  it("closes once", () => {
    const { connection, socket } = connect(events());
    socket.opened();
    connection.close();
    connection.close();
    expect(socket.closeCodes).toEqual([1000]);
  });

  it("drops what is typed after the close", () => {
    const { connection, socket } = connect(events());
    socket.opened();
    connection.close();
    connection.write(new Uint8Array([104]));
    expect(socket.sent).toHaveLength(1);
  });
});
