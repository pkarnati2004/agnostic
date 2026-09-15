// @vitest-environment happy-dom
import type { UsageResponse } from "@agnostic/core";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { REFRESH_INTERVAL_MS } from "./usage-refresh";
import { usageResponse } from "./usage-response.fixture";
import { lastResponse } from "./usage-state";
import { useUsage } from "./use-usage";

// The debounce and the interval policy are createRefreshScheduler's own (usage-refresh.test.ts);
// these tests cover only the React wiring: one read per mount, no duplicate on a plain re-render,
// and no leaked timer after unmount - the contract `App` relies on to mount this hook exactly once.

const RESPONSE: UsageResponse = usageResponse();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function stubClient(usage: () => Promise<UsageResponse>): WorkspaceClient {
  return { usage } as unknown as WorkspaceClient;
}

/** A few empty microtask turns: enough for a passive effect and a resolved promise to settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Advances the fake clock and flushes the effects the resolved reads schedule. */
async function tick(ms: number) {
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

function mount(client: WorkspaceClient, initialStamp = 0) {
  const latest: { current: ReturnType<typeof useUsage> | null } = { current: null };
  function Host(props: { stamp: number }) {
    latest.current = useUsage(client, props.stamp);
    return null;
  }
  const rendered = render(createElement(Host, { stamp: initialStamp }));
  return {
    latest: () => latest.current,
    setStamp: (stamp: number) => act(() => rendered.update(createElement(Host, { stamp }))),
    unmount: rendered.unmount,
  };
}

describe("useUsage", () => {
  it("reads once on mount and holds the answer", async () => {
    let calls = 0;
    const host = mount(
      stubClient(() => {
        calls += 1;
        return Promise.resolve(RESPONSE);
      }),
    );
    await tick(0);

    expect(calls).toBe(1);
    expect(lastResponse(host.latest() as never)).toEqual(RESPONSE);
    host.unmount();
  });

  it("does not read again for a re-render with the same stamp", async () => {
    let calls = 0;
    const host = mount(
      stubClient(() => {
        calls += 1;
        return Promise.resolve(RESPONSE);
      }),
      3,
    );
    await tick(0);
    expect(calls).toBe(1);

    host.setStamp(3);
    await tick(0);

    expect(calls).toBe(1);
    host.unmount();
  });

  it("stops its timers on unmount", async () => {
    const host = mount(stubClient(() => Promise.resolve(RESPONSE)));
    await tick(0);
    host.unmount();
    await tick(REFRESH_INTERVAL_MS * 2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
