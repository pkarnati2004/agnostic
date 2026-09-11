import { createServer, type Server, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { createDaemonClient } from "./daemon-client.js";
import type { Event } from "./event.js";

/**
 * A raw `node:http` server rather than a JSON stub: `events()` hand-parses the SSE wire format,
 * so this is the only place that format is exercised directly against the client.
 */
async function stubSse(
  onConnect: (res: ServerResponse, headers: Record<string, string | string[] | undefined>) => void,
): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    onConnect(res, req.headers);
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

describe("createDaemonClient().events (SSE reader)", () => {
  it("parses a multi-line id/event/data frame and resumes with the last id", async () => {
    const headersByConnection: Array<Record<string, string | string[] | undefined>> = [];
    let connection = 0;
    const daemon = await stubSse((res, headers) => {
      connection += 1;
      headersByConnection.push(headers);
      if (connection === 1) {
        res.write(
          [
            "id: 5",
            "event: task.status",
            `data: ${JSON.stringify({
              id: 5,
              ts: "2026-09-11T10:00:00.000Z",
              taskId: "mnpqrstuvw",
              kind: "task.status",
              payload: { from: "queued", to: "running" },
            })}`,
            "",
            "",
          ].join("\n"),
        );
        res.end();
      } else {
        // Second connection: a comment only, so the reader is left waiting until the test aborts it.
        res.write(": ping\n\n");
      }
    });

    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    const controller = new AbortController();
    const iterator = client.events(0, controller.signal)[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toMatchObject({ id: 5, kind: "task.status", taskId: "mnpqrstuvw" });

    // Async generators are lazy: nothing after the yield runs (the first response finishing, the
    // reconnect delay, the second request) until the caller asks for the next value.
    const pendingSecond = iterator.next();

    // The client reconnects RECONNECT_MS after the frame it already has; wait for that request.
    const deadline = Date.now() + 3_000;
    while (headersByConnection.length < 2) {
      if (Date.now() > deadline) {
        throw new Error("the client never reconnected");
      }
      await new Promise((done) => setTimeout(done, 20));
    }
    expect(headersByConnection[1]?.["last-event-id"]).toBe("5");
    expect(headersByConnection[0]?.["last-event-id"]).toBeUndefined();

    controller.abort();
    expect((await pendingSecond).done).toBe(true);
    await daemon.close();
  }, 8_000);
});

describe("createDaemonClient().events (frame parsing)", () => {
  const event = {
    id: 7,
    ts: "2026-09-11T10:00:00.000Z",
    kind: "task.status",
    payload: { from: "queued", to: "running" },
  };
  const flat = JSON.stringify(event);

  /** The first event off a stream carrying exactly these frames. */
  async function first(frames: string): Promise<Event> {
    const daemon = await stubSse((res) => {
      res.write(frames);
      res.end();
    });
    const controller = new AbortController();
    const client = createDaemonClient({ baseUrl: daemon.baseUrl, token: "sekrit" });
    try {
      for await (const seen of client.events(0, controller.signal)) {
        return seen;
      }
      throw new Error("the stream yielded no event");
    } finally {
      controller.abort();
      await daemon.close();
    }
  }

  it("reads a stream whose lines end in CRLF", async () => {
    const frames = `retry: 1000\r\n\r\nid: 7\r\nevent: task.status\r\ndata: ${flat}\r\n\r\n`;
    expect(await first(frames)).toEqual(event);
  });

  it("joins a data field split over several lines", async () => {
    // A pretty-printed payload is the ordinary case: one `data:` line per line of JSON.
    const pretty = JSON.stringify(event, null, 2)
      .split("\n")
      .map((line) => `data: ${line}`)
      .join("\n");
    expect(await first(`id: 7\nevent: task.status\n${pretty}\n\n`)).toEqual(event);
  });

  it("skips a keepalive comment and a frame with no data", async () => {
    const frames = `: ping\n\nid: 6\nevent: task.status\n\nid: 7\ndata: ${flat}\n\n`;
    expect(await first(frames)).toEqual(event);
  });
});
