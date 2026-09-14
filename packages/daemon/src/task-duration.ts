import type { Event, EventKind, TaskStatus } from "@agnostic/core";

const LIVE: TaskStatus[] = ["running", "waiting"];
const TERMINAL: TaskStatus[] = ["done", "failed", "stopped"];

/**
 * How long the task was actually live, in seconds. A task can be stopped and resumed any number of
 * times, so this is the sum of its live spans and never the wall clock between created and closed.
 */
export function taskDuration(events: Event[], closedAt: string): number {
  let total = 0;
  let liveSince: string | null = null;
  for (const event of events) {
    if (isKind(event, "task.created") && LIVE.includes(event.payload.task.status)) {
      // An adopted task is inserted running: its first span starts where the row does.
      liveSince = event.ts;
    }
    if (!isKind(event, "task.status")) {
      continue;
    }
    if (LIVE.includes(event.payload.to) && !LIVE.includes(event.payload.from)) {
      liveSince = event.ts;
    }
    if (TERMINAL.includes(event.payload.to) && liveSince !== null) {
      total += elapsed(liveSince, event.ts);
      liveSince = null;
    }
  }
  // A task whose last transition is missing from the ledger still ran until it closed. Seconds
  // are not rounded: a task that ran for half a second did run.
  return liveSince === null ? total : total + elapsed(liveSince, closedAt);
}

/** When the task reached the status it closed in; null for one that has never closed. */
export function taskClosedAt(events: Event[]): string | null {
  let closedAt: string | null = null;
  for (const event of events) {
    if (isKind(event, "task.status") && TERMINAL.includes(event.payload.to)) {
      closedAt = event.ts;
    }
  }
  return closedAt;
}

/** `Event` is a union over its kinds; this is what narrows one to the payload of the kind read. */
function isKind<K extends EventKind>(event: Event, kind: K): event is Event<K> {
  return event.kind === kind;
}

// Clocks move backwards; a negative span is a span agn cannot measure, not one below zero.
function elapsed(from: string, to: string): number {
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / 1000);
}
