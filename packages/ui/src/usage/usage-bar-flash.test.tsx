// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceClient } from "../api/client";
import { render } from "../test/render";
import { UsageBar } from "./usage-bar";
import { doctorResponse } from "./usage-response.fixture";
import type { UsageState } from "./usage-state";

const IDLE: UsageState = { kind: "idle" };

const originalScrollIntoView = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
  vi.useRealTimers();
});

function stubClient(): WorkspaceClient {
  return {
    doctor: () => Promise.resolve(doctorResponse()),
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
