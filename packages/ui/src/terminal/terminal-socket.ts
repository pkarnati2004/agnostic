import type { TerminalSize } from "@agnostic/core";
import type { CloseContext } from "./close-notice";
import { decodeServerFrame, encodeResize } from "./terminal-frames";

// The value of core's TERMINAL_TOKEN_PROTOCOL, written out because the page imports types from
// core and never its runtime. The daemon's tests are what keep the two spellings together.
const TOKEN_PROTOCOL = "agn-token.";

export type TerminalSocketEvents = {
  onReady(): void;
  onData(bytes: Uint8Array): void;
  onExit(code: number | null): void;
  onClose(ctx: CloseContext): void;
};

export type TerminalConnection = {
  write(bytes: Uint8Array): void;
  resize(size: TerminalSize): void;
  close(): void;
};

export type ConnectOptions = {
  taskId: string;
  token: string;
  /** Sent as the first frame, which is what sizes the pty (ADR 025). */
  size: TerminalSize;
  events: TerminalSocketEvents;
  /** Injected by the tests; the page uses the browser's own. */
  WebSocket?: typeof WebSocket;
  /** The page's own unless a test names one; the daemon accepts only its own origin anyway. */
  page?: Pick<Location, "protocol" | "host">;
};

/** One tmux client for one tab: bytes as binary frames, resize up, ready and exit down. */
export function connectTerminal(opts: ConnectOptions): TerminalConnection {
  const Socket = opts.WebSocket ?? WebSocket;
  const ws = new Socket(terminalUrl(opts.page ?? location, opts.taskId), [
    TOKEN_PROTOCOL + opts.token,
  ]);
  ws.binaryType = "arraybuffer";

  const state = { open: false, closed: false, sawExit: false, closing: false };
  // The newest size before the socket opens and the last one sent after it: the first frame must
  // carry the size the pane has when the pty starts, not the one it had when the tab was opened.
  let size = opts.size;
  const queued: Uint8Array[] = [];
  const sendResize = resizeSender(ws);

  ws.onopen = () => {
    state.open = true;
    sendResize(size);
    for (const bytes of queued.splice(0)) {
      ws.send(bytes);
    }
  };
  ws.onmessage = (event: MessageEvent<unknown>) => receive(event.data, opts.events, state);
  ws.onclose = (event: CloseEvent) => {
    state.closed = true;
    opts.events.onClose({ code: event.code, reason: event.reason, sawExit: state.sawExit });
  };

  return {
    write: (bytes) => {
      if (state.closed || state.closing) {
        return;
      }
      if (state.open) {
        ws.send(bytes);
        return;
      }
      queued.push(bytes);
    },
    resize: (next) => {
      size = next;
      if (state.open && !state.closed && !state.closing) {
        sendResize(next);
      }
    },
    close: () => {
      if (state.closed || state.closing) {
        return;
      }
      state.closing = true;
      ws.close(1000);
    },
  };
}

/** The socket follows the page: a workspace behind a TLS front is wss, everything else ws. */
function terminalUrl(page: Pick<Location, "protocol" | "host">, taskId: string): string {
  const scheme = page.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${page.host}/tasks/${encodeURIComponent(taskId)}/terminal`;
}

/** A size the daemon already has is not worth a frame; the pane fits on every layout change. */
function resizeSender(ws: WebSocket): (size: TerminalSize) => void {
  let sent: TerminalSize | null = null;
  return (size) => {
    if (sent !== null && sent.cols === size.cols && sent.rows === size.rows) {
      return;
    }
    sent = size;
    ws.send(encodeResize(size));
  };
}

type SocketState = { sawExit: boolean };

function receive(data: unknown, events: TerminalSocketEvents, state: SocketState): void {
  if (typeof data === "string") {
    const frame = decodeServerFrame(data);
    if (frame === null) {
      return;
    }
    if (frame.type === "ready") {
      events.onReady();
      return;
    }
    state.sawExit = true;
    events.onExit(frame.code ?? null);
    return;
  }
  if (data instanceof ArrayBuffer) {
    events.onData(new Uint8Array(data));
  }
}
