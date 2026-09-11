import type { Event } from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventFeed } from "./event-feed.js";

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
});

afterEach(() => {
  ledger.close();
});

function appendStatus(taskId: string): void {
  ledger.events.append({
    ts: new Date().toISOString(),
    taskId,
    kind: "task.status",
    payload: { from: "queued", to: "running" },
  });
}

function untilLength(events: Event[], length: number, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (events.length >= length) {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new Error(`only ${events.length} of ${length} events arrived`));
      } else {
        setTimeout(check, 5);
      }
    };
    check();
  });
}

describe("createEventFeed", () => {
  it("replays everything after the cursor before it returns", () => {
    appendStatus("mnpqrstuvw");
    appendStatus("mnpqrstuvw");
    const feed = createEventFeed(ledger, 20);
    const seen: Event[] = [];
    feed.subscribe(0, (event) => seen.push(event));
    expect(seen.map((event) => event.id)).toEqual([1, 2]);
    feed.close();
  });

  it("replays only what the cursor has not seen", () => {
    appendStatus("mnpqrstuvw");
    appendStatus("mnpqrstuvw");
    const feed = createEventFeed(ledger, 20);
    const seen: Event[] = [];
    feed.subscribe(1, (event) => seen.push(event));
    expect(seen.map((event) => event.id)).toEqual([2]);
    feed.close();
  });

  it("delivers a write that happens after the subscription", async () => {
    const feed = createEventFeed(ledger, 20);
    const seen: Event[] = [];
    feed.subscribe(0, (event) => seen.push(event));
    appendStatus("mnpqrstuvw");
    await untilLength(seen, 1);
    expect(seen[0]?.kind).toBe("task.status");
    feed.close();
  });

  it("gives two subscribers their own cursor", async () => {
    appendStatus("mnpqrstuvw");
    const feed = createEventFeed(ledger, 20);
    const early: Event[] = [];
    const late: Event[] = [];
    feed.subscribe(0, (event) => early.push(event));
    feed.subscribe(1, (event) => late.push(event));
    appendStatus("mnpqrstuvw");
    await untilLength(early, 2);
    await untilLength(late, 1);
    expect(early.map((event) => event.id)).toEqual([1, 2]);
    expect(late.map((event) => event.id)).toEqual([2]);
    feed.close();
  });

  it("stops polling once the last subscriber leaves", async () => {
    const feed = createEventFeed(ledger, 20);
    const seen: Event[] = [];
    const unsubscribe = feed.subscribe(0, (event) => seen.push(event));
    unsubscribe();
    appendStatus("mnpqrstuvw");
    await new Promise((done) => setTimeout(done, 60));
    expect(seen).toEqual([]);
    feed.close();
  });

  it("stops reading the ledger once the last subscriber leaves", async () => {
    const latestId = vi.spyOn(ledger.events, "latestId");
    const feed = createEventFeed(ledger, 10);
    const unsubscribe = feed.subscribe(0, () => undefined);
    await new Promise((done) => setTimeout(done, 60));
    expect(latestId.mock.calls.length).toBeGreaterThan(0);
    unsubscribe();
    const callsAtUnsubscribe = latestId.mock.calls.length;
    await new Promise((done) => setTimeout(done, 60));
    expect(latestId.mock.calls.length).toBe(callsAtUnsubscribe);
    feed.close();
    latestId.mockRestore();
  });
});
