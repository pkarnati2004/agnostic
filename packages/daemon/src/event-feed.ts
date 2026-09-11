import type { Event } from "@agnostic/core";
import type { Ledger } from "@agnostic/ledger";

const DEFAULT_POLL_MS = 250;
const PAGE = 500;

type Subscriber = { cursor: number; send: (event: Event) => void };

export type EventFeed = {
  /** Replays everything after `cursor`, then keeps sending. Call the result to unsubscribe. */
  subscribe(cursor: number, send: (event: Event) => void): () => void;
  close(): void;
};

/**
 * SQLite has no notification, so the feed asks for the latest id four times a second while
 * anyone is listening and sleeps when nobody is. If the UI ever needs less latency than that,
 * the ledger grows an after-commit emitter and this file loses the timer.
 */
export function createEventFeed(ledger: Ledger, pollMs: number = DEFAULT_POLL_MS): EventFeed {
  const subscribers = new Set<Subscriber>();
  let timer: NodeJS.Timeout | null = null;

  const tick = () => {
    const latest = ledger.events.latestId();
    for (const subscriber of subscribers) {
      if (subscriber.cursor < latest) {
        drain(ledger, subscriber);
      }
    }
  };

  return {
    subscribe(cursor: number, send: (event: Event) => void): () => void {
      const subscriber: Subscriber = { cursor, send };
      drain(ledger, subscriber);
      subscribers.add(subscriber);
      if (timer === null) {
        timer = setInterval(tick, pollMs);
        // The HTTP server keeps the process alive; this timer should never be the reason it does.
        timer.unref();
      }
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },

    close(): void {
      subscribers.clear();
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

/** Pages, because a subscriber joining with `?after=0` on an old ledger would otherwise load it all. */
function drain(ledger: Ledger, subscriber: Subscriber): void {
  for (;;) {
    const page = ledger.events.after(subscriber.cursor, PAGE);
    for (const event of page) {
      subscriber.cursor = event.id;
      subscriber.send(event);
    }
    if (page.length < PAGE) {
      return;
    }
  }
}
