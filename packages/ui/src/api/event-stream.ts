import type { Event } from "@agnostic/core";
import { apiError, unreachable } from "./error";

// The SSE line terminator is CRLF, CR or LF, and a blank line ends a frame (WHATWG "event stream").
const LINE = /\r\n|\r|\n/;

const RECONNECT_MS = 1_000;

/** Reads an SSE response body, yielding one event per complete frame. */
export async function* readFrames(response: Response): AsyncGenerator<Event> {
  if (response.body === null) {
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lines: string[] = [];
  let buffer = "";
  while (true) {
    const chunk = await reader.read().catch(() => ({ done: true, value: undefined }) as const);
    if (chunk.done) {
      return;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    const complete = buffer.split(LINE);
    // The last piece has no terminator yet, so it waits for the next chunk.
    buffer = complete.pop() ?? "";
    for (const line of complete) {
      if (line !== "") {
        lines.push(line);
        continue;
      }
      const event = parseFrame(lines);
      lines = [];
      if (event !== null) {
        yield event;
      }
    }
  }
}

/** Whether the page is reading the feed now, or waiting to get back onto it. */
export type FeedState = "live" | "reconnecting";

/**
 * The feed the page reads for as long as it is open: one request per connection, resumed from the
 * last id seen after a drop. The first connection failing is a daemon that is not there; a drop
 * after that is a daemon restarting, which is worth waiting out. `onState` reports each connection
 * and each drop after the first connection, which is what the sidebar footer and the banner draw.
 */
export async function* streamEvents(opts: {
  fetch: typeof fetch;
  baseUrl: string;
  token: string;
  after: number;
  signal: AbortSignal;
  reconnectMs?: number;
  onState?: (state: FeedState) => void;
}): AsyncGenerator<Event> {
  const headers = { authorization: `Bearer ${opts.token}` };
  const reconnectMs = opts.reconnectMs ?? RECONNECT_MS;
  // Called off `opts` the browser's fetch would see the options object as its `this` and refuse.
  const doFetch = opts.fetch;
  const report = opts.onState ?? (() => undefined);
  let cursor = opts.after;
  let connected = false;
  while (!opts.signal.aborted) {
    let response: Response;
    try {
      response = await doFetch(`${opts.baseUrl}/events?after=${cursor}`, {
        headers: connected ? { ...headers, "last-event-id": String(cursor) } : headers,
        signal: opts.signal,
      });
    } catch (cause) {
      if (opts.signal.aborted) {
        return;
      }
      // The first connection failing is the bootstrap's failure to report, not a reconnect.
      if (!connected) {
        throw unreachable(opts.baseUrl, cause);
      }
      report("reconnecting");
      await delay(reconnectMs, opts.signal);
      continue;
    }
    if (!response.ok) {
      throw await apiError(response);
    }
    connected = true;
    report("live");
    for await (const event of readFrames(response)) {
      cursor = event.id;
      yield event;
    }
    if (opts.signal.aborted) {
      return;
    }
    report("reconnecting");
    await delay(reconnectMs, opts.signal);
  }
}

/** Comments (`: ping`) and `retry:` carry no event; anything unparsable is skipped, not thrown. */
function parseFrame(lines: string[]): Event | null {
  // A field's value may be split over several `data:` lines, which rejoin with a newline.
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""));
  if (data.length === 0) {
    return null;
  }
  try {
    return asEvent(JSON.parse(data.join("\n")));
  } catch {
    return null;
  }
}

/**
 * The ledger row is the daemon's, written from the same types and already parsed there, so the
 * page checks the frame is an event and trusts the payload the kind implies.
 */
function asEvent(value: unknown): Event | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as { id?: unknown; kind?: unknown; ts?: unknown; payload?: unknown };
  if (!Number.isInteger(row.id) || typeof row.kind !== "string" || typeof row.ts !== "string") {
    return null;
  }
  return typeof row.payload === "object" && row.payload !== null ? (value as Event) : null;
}

/** The wait between connections. It ends early on abort and leaves no listener on the signal. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    function stop(): void {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", stop, { once: true });
  });
}
