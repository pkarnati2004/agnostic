import type { HarnessReport } from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDetectionCache, type Detection } from "./detection-cache.js";
import { fixtureDetection, fixtureProfile } from "./test-detection.js";

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
});

afterEach(() => {
  ledger.close();
});

describe("createDetectionCache", () => {
  it("runs detection once and serves every later read from memory", async () => {
    let calls = 0;
    const cache = createDetectionCache(() => {
      calls += 1;
      return Promise.resolve(fixtureDetection());
    }, ledger);
    const first = await cache.current();
    const second = await cache.current();
    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it("queues one run behind the one in flight, however many ask for it", async () => {
    let calls = 0;
    const releases: Array<(value: Detection) => void> = [];
    const cache = createDetectionCache(() => {
      calls += 1;
      return new Promise<Detection>((resolve) => {
        releases.push(resolve);
      });
    }, ledger);
    // The first caller starts a run; the other two cannot be answered by it, because it began
    // before they asked, so they share the one run queued behind it.
    const first = cache.refresh();
    const rest = Promise.all([cache.refresh(), cache.refresh()]);
    releases[0]?.(fixtureDetection(["sonnet-4.5"]));
    await first;
    await waitUntil(() => releases.length === 2);
    releases[1]?.(fixtureDetection(["opus-4.1"]));
    const [a, b] = await rest;
    expect(calls).toBe(2);
    expect(a).toBe(b);
    expect(a?.profiles.map((profile) => profile.model)).toEqual([null, "opus-4.1"]);
  });

  it("announces every available profile on the first run and nothing on an identical second", async () => {
    const detection = fixtureDetection(["sonnet-4.5"]);
    const cache = createDetectionCache(() => Promise.resolve(detection), ledger);
    await cache.refresh();
    expect(ledger.events.after(0)).toHaveLength(detection.profiles.length);
    const before = ledger.events.latestId();
    await cache.refresh();
    expect(ledger.events.after(before)).toEqual([]);
  });

  it("never announces a profile that is not available", async () => {
    const detection = fixtureDetection([]);
    detection.profiles = [{ ...fixtureProfile("ghost"), available: false }];
    const cache = createDetectionCache(() => Promise.resolve(detection), ledger);
    await cache.refresh();
    expect(ledger.events.after(0)).toEqual([]);
  });

  it("lets a failed run surface and retries on the next read", async () => {
    let calls = 0;
    const cache = createDetectionCache(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("PATH is empty"))
        : Promise.resolve(fixtureDetection());
    }, ledger);
    await expect(cache.refresh()).rejects.toThrow("PATH is empty");
    await expect(cache.current()).resolves.toMatchObject({ pathVar: "/opt/bin" });
    expect(calls).toBe(2);
  });

  it("looks again when an auth file has changed since the last run", async () => {
    let calls = 0;
    let stamp = "before";
    const cache = createDetectionCache(
      () => {
        calls += 1;
        return Promise.resolve(fixtureDetection());
      },
      ledger,
      () => Promise.resolve(stamp),
    );
    await cache.current();
    await cache.current();
    expect(calls).toBe(1);
    stamp = "after a re-login";
    await cache.current();
    expect(calls).toBe(2);
  });

  it("records a plan that changed, and nothing when only its source did", async () => {
    let plan: HarnessReport["plan"] = null;
    const cache = createDetectionCache(() => {
      const detection = fixtureDetection();
      const [report] = detection.harnesses;
      if (report) {
        report.plan = plan;
      }
      return Promise.resolve(detection);
    }, ledger);
    await cache.refresh();
    plan = { value: "max20", source: "detected", known: true, confirmed: true, overridden: null };
    await cache.refresh();
    const [event] = ledger.events.after(0).filter((row) => row.kind === "plan.changed");
    expect(event?.payload).toEqual({
      harness: "claude-code",
      from: null,
      to: "max20",
      source: "detected",
    });
    const before = ledger.events.latestId();
    plan = { value: "max20", source: "config", known: true, confirmed: true, overridden: null };
    await cache.refresh();
    expect(ledger.events.after(before)).toEqual([]);
  });

  it("says nothing about a plan on the first run: there was nothing to change from", async () => {
    const cache = createDetectionCache(() => Promise.resolve(fixtureDetection()), ledger);
    await cache.refresh();
    expect(ledger.events.after(0).map((row) => row.kind)).not.toContain("plan.changed");
  });
});

/** The queued run starts on a later turn of the loop, so a test waits for it rather than sleeping. */
async function waitUntil(done: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
