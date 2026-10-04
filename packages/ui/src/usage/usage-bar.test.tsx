// @vitest-environment happy-dom
import type { DoctorRequest, UsageResponse } from "@agnostic/core";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { UsageBar } from "./usage-bar";
import {
  claudeLimit,
  claudePlan,
  doctorResponse,
  subscriptionTaskUsage,
  usageResponse,
} from "./usage-response.fixture";
import type { UsageState } from "./usage-state";

const IDLE: UsageState = { kind: "idle" };

const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.useRealTimers();
});

function stubClient(calls: DoctorRequest[] = []): WorkspaceClient {
  return {
    doctor: (body: DoctorRequest) => {
      calls.push(body);
      return Promise.resolve(doctorResponse());
    },
  } as unknown as WorkspaceClient;
}

// Holds `flash` the way the page does: a counter bumped once per ask, never reset. Swapping the
// whole element via a root's own `update()` does not reliably re-run this component's effect in
// this test environment, so the bump is a real click driving the component's own re-render.
function Harness() {
  const [flash, setFlash] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setFlash((count) => count + 1)}>
        ask for the cost
      </button>
      <UsageBar
        state={IDLE}
        flash={flash}
        taskUsage={null}
        showTask={false}
        client={stubClient()}
        refresh={() => undefined}
      />
    </>
  );
}

function footer(container: HTMLElement): HTMLElement {
  const found = container.querySelector("footer");
  if (found === null) {
    throw new Error("no footer drawn");
  }
  return found;
}

function bump(container: HTMLElement): void {
  const button = container.querySelector("button") as HTMLButtonElement;
  act(() => button.click());
}

/** A few empty microtask turns: enough for a passive effect and a resolved promise to settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UsageBar flash", () => {
  it("does nothing before the first ask", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { container, unmount } = render(<Harness />);

    expect(scroll).not.toHaveBeenCalled();
    expect(footer(container).className).not.toContain("ring-2");
    unmount();
  });

  it("scrolls the bar into view and rings it on a flash, then clears the ring after 1.5s", async () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { container, unmount } = render(<Harness />);

    bump(container);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(footer(container).className).toContain("ring-2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(footer(container).className).not.toContain("ring-2");
    unmount();
  });

  it("flashes again on the next ask even while the previous ring is still showing", async () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    const { container, unmount } = render(<Harness />);

    bump(container);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    bump(container);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    // The first ring's 1.5s would have elapsed by now; the second ask's timer keeps it lit.
    expect(footer(container).className).toContain("ring-2");
    unmount();
  });

  it("leaves no timer behind when the bar unmounts before the ring would clear", () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    const { container, unmount } = render(<Harness />);

    bump(container);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("UsageBar cells", () => {
  const loaded = (response: UsageResponse): UsageState => ({
    kind: "ready",
    response,
    fetchedAt: 1_000,
  });

  function bar(
    state: UsageState,
    over: { client?: WorkspaceClient; showTask?: boolean; refresh?: () => void } = {},
  ) {
    return render(
      <TooltipProvider>
        <UsageBar
          state={state}
          flash={0}
          taskUsage={subscriptionTaskUsage}
          showTask={over.showTask ?? false}
          client={over.client ?? stubClient()}
          refresh={over.refresh ?? (() => undefined)}
        />
      </TooltipProvider>,
    );
  }

  /** One Claude plan with its meter current, so nothing else in the bar asks a question. */
  function claudeOnly(fableShare: number | null, plan: string | null = "max20"): UsageResponse {
    const day = [claudePlan({ plan, fableShare })];
    return usageResponse(day, day, { day: null, week: null }, [claudeLimit()]);
  }

  it("draws each plan's own meter where a file on this machine reports one", () => {
    const { container, unmount } = bar(loaded(claudeOnly(null)));

    expect(footer(container).textContent).toContain("5h58%");
    unmount();
  });

  it("says nothing about Fable in the cell (ADR 029, 2026-09-30)", () => {
    const { container, unmount } = bar(loaded(claudeOnly(0.22)));

    expect(footer(container).textContent?.toLowerCase()).not.toContain("fable");
    unmount();
  });

  it("keeps the task's own figures for a task tab and nothing else", () => {
    const shown = bar(loaded(claudeOnly(null)), { showTask: true });
    expect(footer(shown.container).textContent).toContain("This task");
    shown.unmount();

    const hidden = bar(loaded(claudeOnly(null)));
    expect(footer(hidden.container).textContent).not.toContain("This task");
    hidden.unmount();
  });

  it("asks for the plan options once, and only for a plan agn cannot name", async () => {
    const calls: DoctorRequest[] = [];
    const { container, unmount } = bar(loaded(claudeOnly(null, null)), {
      client: stubClient(calls),
    });
    await flush();

    expect(calls).toEqual([{}]);
    expect(footer(container).textContent).toContain("Which Claude plan are you on?");
    unmount();
  });

  it("never asks the daemon while every plan is known", async () => {
    const calls: DoctorRequest[] = [];
    const { unmount } = bar(loaded(claudeOnly(null)), { client: stubClient(calls) });
    await flush();

    expect(calls).toEqual([]);
    unmount();
  });

  it("asks the daemon once even though two cells cannot name their plan", async () => {
    const calls: DoctorRequest[] = [];
    const day = [
      claudePlan({ plan: null }),
      claudePlan({ harness: "codex", vendor: "chatgpt", plan: null }),
    ];
    const { container, unmount } = bar(loaded(usageResponse(day, day)), {
      client: stubClient(calls),
    });
    await flush();

    expect(calls).toEqual([{}]);
    const questions = footer(container).querySelectorAll('[data-state="unknown"]');
    expect(questions.length).toBe(2);
    unmount();
  });

  it("keeps the question at '…' with no error line when detection itself fails", async () => {
    const calls: DoctorRequest[] = [];
    const failing: WorkspaceClient = {
      doctor: (body: DoctorRequest) => {
        calls.push(body);
        return Promise.reject(new Error("doctor is not answering"));
      },
    } as unknown as WorkspaceClient;
    const { container, unmount } = bar(loaded(claudeOnly(null, null)), { client: failing });
    await flush();

    expect(calls).toEqual([{}]);
    const text = footer(container).textContent ?? "";
    expect(text).toContain("Which Claude plan are you on?");
    expect(text).toContain("…");
    expect(footer(container).querySelector('[role="alert"]')).toBe(null);
    unmount();
  });

  it("writes the plan the user picked, then re-reads the figures", async () => {
    const calls: DoctorRequest[] = [];
    const refresh = vi.fn();
    const { container, unmount } = bar(loaded(claudeOnly(null, null)), {
      client: stubClient(calls),
      refresh,
    });
    await flush();

    const chips = Array.from(footer(container).querySelectorAll("button"));
    click(chips[2] as Element);
    await flush();

    expect(calls).toEqual([{}, { plans: { claude: "max20" } }]);
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("says it is reading before the first body lands", () => {
    const { container, unmount } = bar(IDLE);

    expect(footer(container).textContent).toBe("reading usage…");
    unmount();
  });

  it("says a day with no plan row is a day with no usage", () => {
    const { container, unmount } = bar(loaded(usageResponse([], [])));

    expect(footer(container).textContent).toContain("no usage today");
    unmount();
  });
});
