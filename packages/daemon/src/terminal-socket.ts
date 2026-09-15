import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { TERMINAL_TOKEN_PROTOCOL } from "@agnostic/core";
import { type WebSocket, WebSocketServer } from "ws";
import type { DaemonContext } from "./app.js";
import { tokenDigest, tokenMatches } from "./auth.js";
import { DaemonError, errorBody, noRoute } from "./error.js";
import { originAllowed, originForbidden } from "./origin.js";
import { resolveTaskId } from "./resolve-id.js";
import { attachableHandle } from "./task-session.js";
import { bridgeTerminal } from "./terminal-bridge.js";

const TERMINAL_PATH = /^\/tasks\/([^/]+)\/terminal$/;

/** A pty writes in kilobytes; a megabyte frame is a client that has stopped making sense. */
const MAX_PAYLOAD = 1024 * 1024;

const CLOSE_GOING_AWAY = 1001;

/** How long a socket told to go away has to answer before it is cut; `ws` would wait 30 s. */
const TERMINATE_MS = 1_000;

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  500: "Internal Server Error",
};

export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

/**
 * `WS /tasks/:id/terminal`: who may connect. The upgrade is answered by hand rather than by a
 * route because a WebSocket upgrade never reaches Hono's fetch handler; what flows once the socket
 * is accepted is `terminal-bridge.ts`.
 */
export function createTerminalSocket(ctx: DaemonContext): {
  upgrade: UpgradeHandler;
  close(): void;
} {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    // Echoed back so the browser's `ws.protocol` confirms which token the daemon accepted.
    handleProtocols: (protocols) => presentedProtocol([...protocols]) ?? false,
  });
  const open = new Set<WebSocket>();
  // Once per socket server rather than per upgrade: the token does not change while agnd runs.
  const expectedToken = tokenDigest(ctx.token);

  const refuse = (socket: Duplex, cause: unknown, taskId: string | null) => {
    const { status, body } = errorBody(cause);
    writeRefusal(socket, status, body);
    ctx.log.info("terminal refused", {
      ...(taskId === null ? {} : { taskId }),
      status,
      code: body.error.code,
    });
  };

  const accept = async (req: IncomingMessage, socket: Duplex, head: Buffer, id: string) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !originAllowed(origin, ctx.port())) {
      throw originForbidden(origin);
    }
    const presented = presentedProtocol(protocolList(req));
    if (
      presented === null ||
      !tokenMatches(presented.slice(TERMINAL_TOKEN_PROTOCOL.length), expectedToken)
    ) {
      throw unauthorized();
    }
    const task = await ctx.lifecycle.reconcile(resolveTaskId(ctx.ledger, id));
    const handle = await attachableHandle(ctx.executor, task);
    wss.handleUpgrade(req, socket, head, (ws) => {
      open.add(ws);
      ws.once("close", () => open.delete(ws));
      ctx.log.info("terminal connect", { taskId: task.id });
      bridgeTerminal({
        ws,
        taskId: task.id,
        log: ctx.log,
        open: (size) => ctx.executor.terminal(handle, size),
      });
    });
  };

  return {
    upgrade: (req, socket, head) => {
      // Until `ws` takes the socket it has no error listener of its own, and the checks below
      // await tmux; a client that drops in that window would otherwise take the daemon with it.
      socket.on("error", () => socket.destroy());
      const match = TERMINAL_PATH.exec(pathOf(req));
      const id = match?.[1];
      if (id === undefined) {
        refuse(socket, noRoute(pathOf(req)), null);
        return;
      }
      accept(req, socket, head, id).catch((cause: unknown) => refuse(socket, cause, id));
    },
    close: () => {
      // The bridge closes the stream when the socket does, so no tmux client is left behind.
      for (const ws of [...open]) {
        closeOrTerminate(ws);
      }
      wss.close();
    },
  };
}

/**
 * Telling a socket to go away and, if the client never answers, cutting it. `ws` holds the close
 * handshake open for 30 s, and a frozen tab never replies, so `agnd stop` would wait that long on
 * `server.close`. The timer is unref'd and cleared on close: nothing waits on it either way.
 */
export function closeOrTerminate(ws: WebSocket): void {
  const cut = setTimeout(() => ws.terminate(), TERMINATE_MS);
  cut.unref();
  // Armed before the close frame goes out, so a socket that closes at once still clears it.
  ws.once("close", () => clearTimeout(cut));
  ws.close(CLOSE_GOING_AWAY, "daemon stopping");
}

/** The one subprotocol agn understands; a client that offers others is offering the wrong thing. */
function presentedProtocol(protocols: string[]): string | null {
  return protocols.find((value) => value.startsWith(TERMINAL_TOKEN_PROTOCOL)) ?? null;
}

function protocolList(req: IncomingMessage): string[] {
  return (req.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");
}

function pathOf(req: IncomingMessage): string {
  // The origin is a placeholder: only the path of a same-host upgrade is ever read from it.
  return new URL(req.url ?? "/", "http://127.0.0.1").pathname;
}

/**
 * A refusal before the upgrade is a plain HTTP response, so curl and the browser's devtools show
 * the same `{error:{code,message,hint}}` body as any route (ADR 010).
 */
function writeRefusal(socket: Duplex, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  socket.write(
    [
      `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? "Error"}`,
      "content-type: application/json",
      `content-length: ${Buffer.byteLength(payload)}`,
      "connection: close",
      "",
      payload,
    ].join("\r\n"),
  );
  socket.destroy();
}

function unauthorized(): DaemonError {
  return new DaemonError("this socket carries no valid agn auth token", {
    code: "unauthorized",
    hint: "The workspace sends the token as the `agn-token.<token>` subprotocol.",
  });
}
