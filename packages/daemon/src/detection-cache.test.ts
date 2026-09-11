import type { DoctorResponse } from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDetectionCache } from "./detection-cache.js";
import { fixtureDetection, fixtureProfile } from "./test-daemon.js";

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

  it("shares one run between concurrent refreshes", async () => {
    let calls = 0;
    let release: (value: DoctorResponse) => void = () => undefined;
    const cache = createDetectionCache(() => {
      calls += 1;
      return new Promise<DoctorResponse>((resolve) => {
        release = resolve;
      });
    }, ledger);
    const both = Promise.all([cache.refresh(), cache.refresh()]);
    release(fixtureDetection());
    const [a, b] = await both;
    expect(calls).toBe(1);
    expect(a).toBe(b);
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
});
