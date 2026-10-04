import { readFile } from "node:fs/promises";
import type { CatalogCheckState } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CheckerFixture,
  createCheckerFixture,
  drain,
  HOUR_MS,
  NOW,
  published,
  SOURCE,
} from "./test-catalog-checker.js";

let fixture: CheckerFixture;

/** Only the timers are faked, so the file writes a check makes still happen on their own. */
function fakeTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"] });
}

/**
 * Drains the I/O a check queues; a faked clock does not move file writes along. The wait is on the
 * real clock, not on a count of event-loop turns: a loaded machine runs through a thousand of them
 * while one write is still in flight. The extra rounds after the condition holds let the check
 * finish, not just reach the point being waited for.
 */
async function settle(until: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!until() && Date.now() < deadline) {
    await new Promise((done) => setImmediate(done));
  }
  await drain();
}

/**
 * Waits until a check has been recorded and is no longer in flight. The state file is written last,
 * so a run that reloaded the store may still be inside `record`; advancing the clock then would
 * hand the timer the check already running instead of starting the next one.
 */
async function settleCheck(outcome: CatalogCheckState["outcome"]): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const recorded = await fixture.readState().catch(() => null);
    if (recorded?.outcome === outcome) {
      // Only microtasks stand between the written file and the checker releasing its slot.
      await drain();
      return;
    }
    await new Promise((done) => setImmediate(done));
  }
  throw new Error(`no ${outcome} check was recorded within 10 s`);
}

beforeEach(async () => {
  fixture = await createCheckerFixture();
});

afterEach(async () => {
  vi.useRealTimers();
  await fixture.close();
});

describe("when the catalog checker checks", () => {
  it("checks at start when nothing was ever recorded", async () => {
    fakeTimers();
    const checker = fixture.create({ fetch: await published(), startDelayMs: 5_000 });
    expect(checker.lastCheck()).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    await settleCheck("updated");
    expect(checker.lastCheck()).toMatchObject({ outcome: "updated" });
  });

  it("does not check at start when the last check was an hour ago", async () => {
    await fixture.writeState({ checkedAt: new Date(NOW.getTime() - HOUR_MS).toISOString() });
    fakeTimers();
    const checker = fixture.create({ fetch: await published() });
    await vi.advanceTimersByTimeAsync(60_000);
    await drain(500);
    // The state file is the one from an hour ago, untouched: no check ran.
    expect(checker.lastCheck()?.remoteVersion).toBe(1);
    expect(fixture.counts.reloads).toBe(0);
  });

  it("checks at start when the last check was more than a day ago, and again a day later", async () => {
    await fixture.writeState({ checkedAt: new Date(NOW.getTime() - 25 * HOUR_MS).toISOString() });
    const serve = await published();
    let manifests = 0;
    fakeTimers();
    fixture.create({
      intervalMs: 24 * HOUR_MS,
      fetch: (input, init) => {
        manifests += Number(String(input) === SOURCE.manifestUrl);
        return serve(input, init);
      },
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await settleCheck("updated");
    expect(fixture.counts.reloads).toBe(1);
    expect(manifests).toBe(1);
    await vi.advanceTimersByTimeAsync(24 * HOUR_MS);
    await settle(() => manifests === 2);
    // The second check finds the version it just downloaded, so there is nothing to reload.
    expect(manifests).toBe(2);
    expect(fixture.counts.reloads).toBe(1);
    expect(fixture.counts.probes).toBe(2);
  });

  it("runs no timer when the daily check is off, and still updates when asked", async () => {
    fakeTimers();
    const off = fixture.create({ enabled: false, fetch: await published() });
    await vi.advanceTimersByTimeAsync(48 * HOUR_MS);
    await drain(500);
    expect(fixture.counts.reloads).toBe(0);
    expect(await readFile(fixture.paths.catalogCheck, "utf8").catch(() => null)).toBeNull();

    vi.useRealTimers();
    expect((await off.update()).outcome).toBe("updated");
    expect(fixture.counts.reloads).toBe(1);
  });

  it("unrefs its timers so a pending check never keeps a process running", async () => {
    // setTimeout and setInterval share one Timeout prototype in Node; spying there catches both.
    const timer = setTimeout(() => undefined, 0);
    clearTimeout(timer);
    const unref = vi.spyOn(Object.getPrototypeOf(timer) as { unref(): void }, "unref");
    fixture.create({ fetch: await published(), startDelayMs: 100_000, intervalMs: 100_000 });
    expect(unref).toHaveBeenCalled();
    unref.mockRestore();
  });
});
