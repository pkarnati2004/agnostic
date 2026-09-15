import type { Event } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { readFrames, streamEvents } from "./event-stream";

function statusEvent(id: number): Event {
  return {
    id,
    ts: "2026-09-14T10:00:00.000Z",
    taskId: "task1",
    kind: "task.status",
    payload: { from: "running", to: "waiting" },
  };
}

function frame(event: Event, terminator = "\n\n"): string {
  return `id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}${terminator}`;
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(response: Response): Promise<Event[]> {
  const events: Event[] = [];
  for await (const event of readFrames(response)) {
    events.push(event);
  }
  return events;
}

describe("readFrames", () => {
  it("reads two frames from one chunk", async () => {
    const body = frame(statusEvent(1)) + frame(statusEvent(2));
    expect((await collect(sseResponse([body]))).map((event) => event.id)).toEqual([1, 2]);
  });

  it("reads a frame split across chunks", async () => {
    const body = frame(statusEvent(7));
    const cut = body.length - 5;
    const events = await collect(sseResponse([body.slice(0, cut), body.slice(cut)]));
    expect(events).toEqual([statusEvent(7)]);
  });

  it("skips comments and retry lines", async () => {
    const body = `: ping\n\nretry: 1000\n\n${frame(statusEvent(3))}`;
    expect((await collect(sseResponse([body]))).map((event) => event.id)).toEqual([3]);
  });

  it("reads CRLF frames", async () => {
    const event = statusEvent(4);
    const body = `id: 4\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
    expect(await collect(sseResponse([body]))).toEqual([event]);
  });

  it("joins a data field split over several lines", async () => {
    const event = statusEvent(6);
    const json = JSON.stringify(event);
    // Split right after a comma: the rejoined newline sits where JSON treats whitespace as
    // insignificant, so the two `data:` lines still parse as one object.
    const cut = json.indexOf(",") + 1;
    const body = `id: 6\ndata: ${json.slice(0, cut)}\ndata: ${json.slice(cut)}\n\n`;
    expect(await collect(sseResponse([body]))).toEqual([event]);
  });

  it("skips a frame whose data is not an event", async () => {
    const body = `data: {"id":"nope"}\n\n${frame(statusEvent(5))}`;
    expect((await collect(sseResponse([body]))).map((event) => event.id)).toEqual([5]);
  });
});

describe("streamEvents", () => {
  it("resumes from the last id seen when the stream ends", async () => {
    const requests: { url: string; lastEventId: string | null }[] = [];
    const bodies = [frame(statusEvent(4)), frame(statusEvent(7))];
    const abort = new AbortController();
    const stream = streamEvents({
      fetch: (input, init) => {
        requests.push({
          url: String(input),
          lastEventId: new Headers(init?.headers).get("last-event-id"),
        });
        return Promise.resolve(sseResponse([bodies[requests.length - 1] ?? ""]));
      },
      baseUrl: "",
      token: "tok",
      after: 0,
      signal: abort.signal,
      reconnectMs: 0,
    });
    const seen: number[] = [];
    for await (const event of stream) {
      seen.push(event.id);
      if (seen.length === 2) {
        abort.abort();
        break;
      }
    }
    expect(seen).toEqual([4, 7]);
    expect(requests).toEqual([
      { url: "/events?after=0", lastEventId: null },
      { url: "/events?after=4", lastEventId: "4" },
    ]);
  });

  it("never fetches when the signal is already aborted", async () => {
    const abort = new AbortController();
    abort.abort();
    let called = false;
    const stream = streamEvents({
      fetch: () => {
        called = true;
        return Promise.resolve(sseResponse([""]));
      },
      baseUrl: "",
      token: "tok",
      after: 0,
      signal: abort.signal,
      reconnectMs: 0,
    });
    expect(await stream.next()).toEqual({ done: true, value: undefined });
    expect(called).toBe(false);
  });

  it("calls fetch as a plain function, as the browser requires", async () => {
    // The window's fetch throws "Illegal invocation" when its `this` is anything but the window.
    function picky(this: unknown): Promise<Response> {
      if (this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      return Promise.resolve(sseResponse([frame(statusEvent(5))]));
    }
    const abort = new AbortController();
    const first = await streamEvents({
      fetch: picky as unknown as typeof fetch,
      baseUrl: "",
      token: "tok",
      after: 0,
      signal: abort.signal,
      reconnectMs: 0,
    }).next();
    abort.abort();
    expect(first.value).toEqual(statusEvent(5));
  });

  it("leaves no abort listener behind when it reconnects", async () => {
    let listeners = 0;
    let aborted = false;
    const signal = {
      get aborted() {
        return aborted;
      },
      addEventListener: () => {
        listeners += 1;
      },
      removeEventListener: () => {
        listeners -= 1;
      },
    } as unknown as AbortSignal;
    let connections = 0;
    const stream = streamEvents({
      fetch: () => {
        connections += 1;
        aborted = connections === 3;
        return Promise.resolve(sseResponse([frame(statusEvent(connections))]));
      },
      baseUrl: "",
      token: "tok",
      after: 0,
      signal,
      reconnectMs: 0,
    });
    const seen: number[] = [];
    for await (const event of stream) {
      seen.push(event.id);
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(listeners).toBe(0);
  });

  it("reports a daemon that never answered", async () => {
    const failure = await streamEvents({
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      baseUrl: "http://127.0.0.1:1",
      token: "tok",
      after: 0,
      signal: new AbortController().signal,
      reconnectMs: 0,
    })
      .next()
      .catch((cause: unknown) => cause);
    expect(failure).toMatchObject({ code: "daemon-unreachable" });
  });
});
