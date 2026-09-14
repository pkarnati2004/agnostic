import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRefreshScheduler,
  POKE_DEBOUNCE_MS,
  REFRESH_INTERVAL_MS,
  type RefreshTimers,
} from "./usage-refresh";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** The fake clock's own timers, so advancing time is the only thing that moves the scheduler. */
function fakeTimers(): RefreshTimers {
  return {
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (handle) => clearTimeout(handle),
    now: () => Date.now(),
  };
}

function scheduler(opts: { visible?: () => boolean; hold?: boolean } = {}) {
  let runs = 0;
  let release: (() => void) | null = null;
  const refresh = createRefreshScheduler({
    timers: fakeTimers(),
    visible: opts.visible ?? (() => true),
    run: () => {
      runs += 1;
      if (opts.hold !== true) {
        return Promise.resolve();
      }
      return new Promise<void>((done) => {
        release = done;
      });
    },
  });
  return {
    refresh,
    runs: () => runs,
    finish: async () => {
      release?.();
      release = null;
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

describe("createRefreshScheduler", () => {
  it("reads once on start and again every interval while the page is visible", async () => {
    const test = scheduler();
    test.refresh.start();
    expect(test.runs()).toBe(1);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(test.runs()).toBe(2);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(test.runs()).toBe(3);
    test.refresh.stop();
  });

  it("collapses a burst of pokes into one read", async () => {
    const test = scheduler();
    test.refresh.poke();
    await vi.advanceTimersByTimeAsync(300);
    test.refresh.poke();
    await vi.advanceTimersByTimeAsync(300);
    test.refresh.poke();
    expect(test.runs()).toBe(0);
    await vi.advanceTimersByTimeAsync(POKE_DEBOUNCE_MS);
    expect(test.runs()).toBe(1);
    test.refresh.stop();
  });

  it("follows a read that a poke arrived during with exactly one more", async () => {
    const test = scheduler({ hold: true });
    test.refresh.start();
    expect(test.runs()).toBe(1);
    test.refresh.poke();
    test.refresh.poke();
    await vi.advanceTimersByTimeAsync(POKE_DEBOUNCE_MS);
    expect(test.runs()).toBe(1);
    await test.finish();
    expect(test.runs()).toBe(2);
    await test.finish();
    expect(test.runs()).toBe(2);
    test.refresh.stop();
  });

  it("stops the interval while the page is hidden", async () => {
    let visible = true;
    const test = scheduler({ visible: () => visible });
    test.refresh.start();
    visible = false;
    test.refresh.visibilityChanged(false);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);
    expect(test.runs()).toBe(1);
    test.refresh.stop();
  });

  it("reads at once when the page comes back with figures older than an interval", async () => {
    let visible = true;
    const test = scheduler({ visible: () => visible });
    test.refresh.start();
    visible = false;
    test.refresh.visibilityChanged(false);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS + 1_000);
    visible = true;
    test.refresh.visibilityChanged(true);
    expect(test.runs()).toBe(2);
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(test.runs()).toBe(3);
    test.refresh.stop();
  });

  it("waits out the rest of the interval when the page comes back quickly", async () => {
    let visible = true;
    const test = scheduler({ visible: () => visible });
    test.refresh.start();
    visible = false;
    test.refresh.visibilityChanged(false);
    await vi.advanceTimersByTimeAsync(5_000);
    visible = true;
    test.refresh.visibilityChanged(true);
    expect(test.runs()).toBe(1);
    test.refresh.stop();
  });

  it("drops pokes while the page is hidden", async () => {
    let visible = true;
    const test = scheduler({ visible: () => visible });
    test.refresh.start();
    visible = false;
    test.refresh.visibilityChanged(false);
    test.refresh.poke();
    await vi.advanceTimersByTimeAsync(POKE_DEBOUNCE_MS * 2);
    expect(test.runs()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    test.refresh.stop();
  });

  it("clears every timer on stop", async () => {
    const test = scheduler();
    test.refresh.start();
    test.refresh.poke();
    test.refresh.stop();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2);
    expect(test.runs()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
