import {
  CoreError,
  TerminalClientFrameSchema,
  type TerminalServerFrame,
  type TerminalSize,
  type TerminalStream,
} from "@agnostic/core";
import { type RawData, WebSocket } from "ws";
import type { Logger } from "./log.js";

/** A half-open socket would hold its tmux client for the life of the daemon, so it is pinged. */
const PING_MS = 30_000;

/** The client broke the frame contract: bytes before the first resize, or a frame we cannot read. */
const CLOSE_POLICY = 1008;
const CLOSE_NORMAL = 1000;
const CLOSE_FAILED = 1011;

type BridgeOptions = {
  ws: WebSocket;
  taskId: string;
  /** Opens the tmux client at the size of the client's first frame; nothing is spawned before it. */
  open: (size: TerminalSize) => Promise<TerminalStream>;
  log: Logger;
};

/**
 * One socket, one `TerminalStream`. Binary frames are pty bytes both ways; the text frames are the
 * resize up and ready/exit down (ADR 025). Nothing is buffered here: a reconnecting client gets
 * tmux's own redraw, which is the only history that exists.
 */
export function bridgeTerminal(opts: BridgeOptions): void {
  const { ws, taskId, log } = opts;
  const startedAt = Date.now();
  let stream: TerminalStream | null = null;
  // `ws` emits every frame of a chunk synchronously, so `ws.pause()` cannot hold back a second
  // resize sent with the first: without this the pty would be opened twice, and the first tmux
  // client of the two would be left attached with nothing reading it.
  let starting = false;
  let pending: TerminalSize | null = null;

  const send = (frame: TerminalServerFrame) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  };

  const start = async (size: TerminalSize) => {
    // Paused while the pty starts, so bytes typed in that window wait in the socket, not in a queue.
    starting = true;
    ws.pause();
    try {
      const opened = await opts.open(size);
      stream = opened;
      // Subscribed before anything else can await: a listener added after the exit never fires.
      opened.onExit((code) => {
        send({ type: "exit", code });
        ws.close(CLOSE_NORMAL, "session ended");
      });
      opened.onData((bytes) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(bytes, { binary: true });
        }
      });
      send({ type: "ready" });
      if (pending !== null) {
        opened.resize(pending);
      }
    } catch (cause) {
      send({ type: "exit" });
      ws.close(CLOSE_FAILED, cause instanceof CoreError ? cause.code : "internal");
    } finally {
      starting = false;
      pending = null;
      ws.resume();
    }
  };

  ws.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      if (stream === null) {
        ws.close(CLOSE_POLICY, "request-invalid");
        return;
      }
      stream.write(bytes(data));
      return;
    }
    const frame = TerminalClientFrameSchema.safeParse(parse(bytes(data).toString("utf8")));
    if (!frame.success) {
      ws.close(CLOSE_POLICY, "request-invalid");
      return;
    }
    const size = { cols: frame.data.cols, rows: frame.data.rows };
    if (starting) {
      // The pty is on its way up at the older size; this one is applied the moment it is there.
      pending = size;
      return;
    }
    if (stream === null) {
      void start(size);
      return;
    }
    stream.resize(size);
  });

  const keepalive = heartbeat(ws);
  ws.on("close", (code: number) => {
    clearInterval(keepalive);
    stream?.close();
    log.info("terminal disconnect", { taskId, durationMs: Date.now() - startedAt, code });
  });
  // Without a listener `ws` throws on a socket error; the close event follows either way.
  ws.on("error", (cause: Error) => {
    log.warn("terminal socket error", { taskId, message: cause.message });
  });
}

/** One missed pong is enough: the pings are 30 s apart and loopback does not lose them. */
function heartbeat(ws: WebSocket): NodeJS.Timeout {
  let answered = true;
  ws.on("pong", () => {
    answered = true;
  });
  const timer = setInterval(() => {
    if (!answered) {
      ws.terminate();
      return;
    }
    answered = false;
    ws.ping();
  }, PING_MS);
  // Nothing should wait on this timer at shutdown; the close handler clears it anyway.
  timer.unref();
  return timer;
}

function bytes(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
