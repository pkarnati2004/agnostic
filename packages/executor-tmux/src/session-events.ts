import type { SessionEvent } from "@agnostic/core";

type EventFanout = {
  emit(event: SessionEvent): void;
  subscribe(listener: (event: SessionEvent) => void): () => void;
  clear(): void;
};

/**
 * Keeps exits that arrive before anyone is listening. The watcher scans the sessions directory
 * as soon as the executor exists, which is before the daemon has wired up its subscriber.
 */
export function createEventFanout(): EventFanout {
  const listeners = new Set<(event: SessionEvent) => void>();
  let pending: SessionEvent[] = [];
  return {
    emit(event) {
      if (listeners.size === 0) {
        pending.push(event);
        return;
      }
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      for (const event of pending.splice(0)) {
        listener(event);
      }
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      listeners.clear();
      pending = [];
    },
  };
}
