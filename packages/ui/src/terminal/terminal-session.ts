import type { TerminalSize } from "@agnostic/core";
import { type CloseContext, closeNotice } from "./close-notice";
import { createReconnect, type Reconnect, type ReconnectOptions } from "./reconnect-backoff";
import { connectTerminal, type TerminalConnection } from "./terminal-socket";

export type SessionPhase = "connecting" | "live" | "reconnecting" | "ended";

export type SessionEvents = {
  onPhase(phase: SessionPhase): void;
  /** One line about the last close, or null when there is nothing to say. */
  onNotice(line: string | null): void;
  onData(bytes: Uint8Array): void;
};

export type TerminalSession = {
  write(bytes: Uint8Array): void;
  resize(size: TerminalSize): void;
  stop(): void;
};

export type SessionOptions = {
  taskId: string;
  token: string;
  size: TerminalSize;
  readStatus: ReconnectOptions["readStatus"];
  events: SessionEvents;
  connect?: typeof connectTerminal;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
};

/** The socket for one tab, reopened after a daemon restart for as long as the task is running. */
export function startSession(opts: SessionOptions): TerminalSession {
  const connect = opts.connect ?? connectTerminal;
  const { events } = opts;
  let connection: TerminalConnection | null = null;
  let size = opts.size;
  let stopped = false;

  const open = () => {
    events.onPhase("connecting");
    connection = connect({
      taskId: opts.taskId,
      token: opts.token,
      size,
      events: {
        onReady: () => live(events, reconnect),
        onData: events.onData,
        onExit: () => events.onPhase("ended"),
        onClose: (ctx) => {
          connection = null;
          if (!stopped) {
            closed(ctx, events, reconnect);
          }
        },
      },
    });
  };

  const reconnect = createReconnect({
    taskId: opts.taskId,
    readStatus: opts.readStatus,
    onLive: open,
    onGone: () => events.onPhase("ended"),
    ...(opts.setTimeout === undefined ? {} : { setTimeout: opts.setTimeout }),
    ...(opts.clearTimeout === undefined ? {} : { clearTimeout: opts.clearTimeout }),
  });

  open();

  return {
    write: (bytes) => connection?.write(bytes),
    resize: (next) => {
      size = next;
      connection?.resize(next);
    },
    stop: () => {
      stopped = true;
      reconnect.stop();
      connection?.close();
      connection = null;
    },
  };
}

function live(events: SessionEvents, reconnect: Reconnect): void {
  reconnect.reset();
  events.onNotice(null);
  events.onPhase("live");
}

/** An exit was the daemon's last word; anything else is a socket the tab tries to replace. */
function closed(ctx: CloseContext, events: SessionEvents, reconnect: Reconnect): void {
  events.onNotice(closeNotice(ctx));
  if (ctx.sawExit) {
    events.onPhase("ended");
    return;
  }
  events.onPhase("reconnecting");
  reconnect.schedule();
}
