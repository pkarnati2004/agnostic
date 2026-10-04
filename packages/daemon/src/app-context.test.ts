import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

const HOUR_MS = 60 * 60 * 1000;

let daemon: TestDaemon | null = null;

/**
 * The clock is faked here, so a wait cannot be on it. Rounds of the event loop let the file writes
 * a check makes finish; the cap is only there so a condition that never holds fails the test
 * instead of hanging it.
 */
async function until(what: string, holds: () => Promise<boolean>): Promise<void> {
  for (let round = 0; round < 50_000; round += 1) {
    if (await holds()) {
      return;
    }
    await new Promise((done) => setImmediate(done));
  }
  throw new Error(`${what} never happened`);
}

/** How many checks have written their outcome to the state file, counted by the stamp on each. */
function checksRecorded(state: string): () => Promise<number> {
  const seen = new Set<string>();
  return async () => {
    const text = await readFile(state, "utf8").catch(() => null);
    const checkedAt = text === null ? null : stampIn(text);
    if (checkedAt !== null) {
      seen.add(checkedAt);
    }
    return seen.size;
  };
}

/** A read that caught a half-written file counts for nothing, not for one more check. */
function stampIn(text: string): string | null {
  try {
    return (JSON.parse(text) as { checkedAt: string }).checkedAt;
  } catch {
    return null;
  }
}

/**
 * Date is faked along with the timers so the probe window, which reads `Date.now`, moves with
 * them. The file writes a check makes are not faked and still happen on their own.
 */
function fakeClock(): void {
  vi.useFakeTimers({
    toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"],
  });
}

afterEach(async () => {
  vi.useRealTimers();
  await daemon?.close();
  daemon = null;
});

describe("createContext", () => {
  it("probes once when the due catalog check lands seconds after the start-up probe", async () => {
    fakeClock();
    // No state file, so the checker finds a check due and runs one five seconds in. It cannot
    // reach 127.0.0.1:1; it records the failure and re-probes all the same.
    daemon = await createTestDaemon({ catalogCheck: true });
    expect(daemon.detectCalls()).toBe(1);
    const recorded = checksRecorded(daemon.paths.catalogCheck);

    await vi.advanceTimersByTimeAsync(5_000);
    await until("the first check", async () => (await recorded()) === 1);

    expect(daemon.detectCalls()).toBe(1);
  });

  it("probes again on the daily check a day later", async () => {
    fakeClock();
    daemon = await createTestDaemon({ catalogCheck: true });
    const recorded = checksRecorded(daemon.paths.catalogCheck);
    await vi.advanceTimersByTimeAsync(5_000);
    await until("the first check", async () => (await recorded()) === 1);

    await vi.advanceTimersByTimeAsync(24 * HOUR_MS);
    await until("the daily check", async () => (await recorded()) === 2);
    await until("the probe it triggers", async () => daemon?.detectCalls() === 2);
  });
});
