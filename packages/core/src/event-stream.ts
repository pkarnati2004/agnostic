import { apiError, unreachable } from "./daemon-errors.js";
import type { Event } from "./event.js";
import { readFrames } from "./event-frames.js";

const RECONNECT_MS = 1_000;

/**
 * The client's end of `/events`: one connection at a time, resumed from the last id it yielded.
 * A drop mid-stream is the daemon restarting, so it reconnects; the first connect failing is a
 * daemon that is not there, which the caller has to hear about.
 */
export async function* streamEvents(
  doFetch: typeof fetch,
  base: string,
  headers: Record<string, string>,
  after: number,
  signal: AbortSignal,
): AsyncGenerator<Event> {
  let cursor = after;
  let connected = false;
  while (!signal.aborted) {
    let response: Response;
    try {
      response = await doFetch(`${base}/events?after=${cursor}`, {
        headers: connected ? { ...headers, "last-event-id": String(cursor) } : headers,
        signal,
      });
    } catch (cause) {
      if (signal.aborted) {
        return;
      }
      if (!connected) {
        throw unreachable(base, cause);
      }
      await delay(RECONNECT_MS, signal);
      continue;
    }
    if (!response.ok) {
      throw await apiError(response);
    }
    connected = true;
    for await (const event of readFrames(response)) {
      cursor = event.id;
      yield event;
    }
    await delay(RECONNECT_MS, signal);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
