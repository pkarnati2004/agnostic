import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedRequest, type DebouncedOptions } from "./debounced-request";

type Started = {
  input: string;
  signal: AbortSignal;
  settle: (out: string) => void;
  fail: (error: unknown) => void;
};

function harness(extra: Partial<DebouncedOptions<string, string>> = {}) {
  const started: Started[] = [];
  const results: string[] = [];
  const errors: unknown[] = [];
  const request = createDebouncedRequest<string, string>({
    delayMs: 300,
    run: (input, signal) =>
      new Promise<string>((resolve, reject) => {
        started.push({ input, signal, settle: resolve, fail: reject });
      }),
    onResult: (_input, out) => results.push(out),
    onError: (_input, error) => errors.push(error),
    ...extra,
  });
  return { request, started, results, errors };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncedRequest", () => {
  it("runs once, with the last input, after the typing stops", async () => {
    const { request, started } = harness();
    request.submit("a");
    await vi.advanceTimersByTimeAsync(100);
    request.submit("ab");
    await vi.advanceTimersByTimeAsync(100);
    request.submit("abc");
    await vi.advanceTimersByTimeAsync(300);
    expect(started.map((call) => call.input)).toEqual(["abc"]);
  });

  it("aborts the call in flight and drops what it answers", async () => {
    const { request, started, results } = harness();
    request.submit("a");
    await vi.advanceTimersByTimeAsync(300);
    request.submit("ab");
    expect(started[0]?.signal.aborted).toBe(true);
    started[0]?.settle("stale");
    await vi.advanceTimersByTimeAsync(300);
    started[1]?.settle("fresh");
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual(["fresh"]);
  });

  it("cancel clears the pending timer and says nothing", async () => {
    const { request, started, results, errors } = harness();
    request.submit("a");
    request.cancel();
    await vi.advanceTimersByTimeAsync(300);
    expect(started).toHaveLength(0);
    expect(results).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("reports a failure that is not an abort", async () => {
    const { request, started, errors } = harness();
    request.submit("a");
    await vi.advanceTimersByTimeAsync(300);
    const failure = new Error("no eligible profile");
    started[0]?.fail(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([failure]);
  });

  it("says nothing about a call the page aborted", async () => {
    const { request, started, errors } = harness();
    request.submit("a");
    await vi.advanceTimersByTimeAsync(300);
    started[0]?.fail(new DOMException("aborted", "AbortError"));
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toEqual([]);
  });
});
