import { type ApiErrorBody, run, type Task, TERMINAL_TOKEN_PROTOCOL } from "@agnostic/core";
import { WebSocket } from "ws";
import { TEST_TOKEN, type TestDaemon, waitFor } from "./test-daemon.js";

// The vitest side of `WS /tasks/:id/terminal`: a `ws` client, and the tmux questions a test asks
// about the pane behind it.

export const TOKEN_PROTOCOL = `${TERMINAL_TOKEN_PROTOCOL}${TEST_TOKEN}`;

export function connect(
  port: number,
  path: string,
  opts: { protocols?: string[]; origin?: string } = {},
): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}${path}`, opts.protocols ?? [TOKEN_PROTOCOL], {
    ...(opts.origin === undefined ? {} : { headers: { origin: opts.origin } }),
  });
}

/** The raw HTTP answer to an upgrade the daemon would not take, which is what a browser shows. */
export function refusal(ws: WebSocket): Promise<{ status: number; body: ApiErrorBody }> {
  return new Promise((done, fail) => {
    ws.once("unexpected-response", (_request, response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        done({
          status: response.statusCode ?? 0,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as ApiErrorBody,
        }),
      );
    });
    ws.once("open", () => fail(new Error("the daemon accepted a socket it should have refused")));
  });
}

type Terminal = {
  ws: WebSocket;
  /** Every text frame the daemon sent, in order: ready first, exit last. */
  text: string[];
  /** Everything the pane has drawn on this client so far, decoded once at the end. */
  pane: () => string;
  closed: Promise<{ code: number; reason: string }>;
};

/** A connected client whose first frame has been answered with ready, so the pty is sized. */
export async function opened(ws: WebSocket, size = { cols: 120, rows: 40 }): Promise<Terminal> {
  const text: string[] = [];
  const bytes: Buffer[] = [];
  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      bytes.push(data);
    } else {
      text.push(data.toString("utf8"));
    }
  });
  const closed = new Promise<{ code: number; reason: string }>((done) => {
    ws.once("close", (code: number, why: Buffer) => done({ code, reason: why.toString("utf8") }));
  });
  await new Promise((ready, fail) => {
    ws.once("open", ready);
    ws.once("error", fail);
  });
  ws.send(JSON.stringify({ type: "resize", ...size }));
  await waitFor("the daemon says ready", () => text.length > 0, 5_000);
  return { ws, text, pane: () => Buffer.concat(bytes).toString("utf8"), closed };
}

export function tmuxIn(daemon: TestDaemon, args: string[]): Promise<string> {
  return run("tmux", ["-L", daemon.launch?.socketName ?? "", ...args], {
    env: daemon.launch?.env,
    inheritEnv: false,
  }).then(
    (result) => result.stdout.trim(),
    // "no such session" is an answer here, not a failure: a killed pane is what some tests assert.
    () => "",
  );
}

export async function attachedClients(daemon: TestDaemon, task: Task): Promise<string[]> {
  const out = await tmuxIn(daemon, ["list-clients", "-t", `agn-${task.id}`, "-F", "#{client_tty}"]);
  return out.split("\n").filter((line) => line !== "");
}

export function paneWidth(daemon: TestDaemon, task: Task): Promise<string> {
  return tmuxIn(daemon, ["display-message", "-p", "-t", `agn-${task.id}`, "#{pane_width}"]);
}
