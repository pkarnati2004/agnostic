// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, find, render } from "../test/render";
import { Toast } from "./toast";
import { type ToastState, useToast } from "./use-toast";

const TTL_MS = 5000;

afterEach(() => vi.useRealTimers());

/** The page's own wiring: the hook holds the toast and the component draws whatever it holds. One
 * button per toast the test means to raise, in the order it means to raise them. */
function Harness({ toasts }: { toasts: ToastState[] }) {
  const { toast, show, dismiss } = useToast(TTL_MS);
  return (
    <>
      {toasts.map((one) => (
        <button
          key={one.message}
          type="button"
          aria-label={`raise ${one.message}`}
          onClick={() => show(one)}
        >
          raise
        </button>
      ))}
      <Toast toast={toast} onDismiss={dismiss} />
    </>
  );
}

function page(...toasts: ToastState[]) {
  return render(<Harness toasts={toasts} />);
}

function raise(container: HTMLElement, message: string) {
  click(find(container, `[aria-label="raise ${message}"]`));
}

function info(message: string): ToastState {
  return { message, tone: "info", action: null };
}

describe("Toast", () => {
  it("draws nothing until there is something to say", () => {
    const { container, unmount } = page(info("gone"));
    expect(container.querySelector('[role="status"]')).toBeNull();
    unmount();
  });

  it("says what happened and offers the one thing to do about it", () => {
    const run = vi.fn();
    const moved = "Add the invite links moved to History";
    const { container, unmount } = page({
      message: moved,
      tone: "info",
      action: { label: "Resume", run },
    });
    raise(container, moved);
    const toast = find(container, '[role="status"]');
    expect(toast.textContent).toContain(moved);
    const resume = [...toast.querySelectorAll("button")].find(
      (one) => one.textContent === "Resume",
    );
    click(resume as Element);
    expect(run).toHaveBeenCalledOnce();
    unmount();
  });

  it("carries the tone a failure was raised with and nothing to click", () => {
    const failed = "Archive failed for Add the invite links: it is still running";
    const { container, unmount } = page({ message: failed, tone: "error", action: null });
    raise(container, failed);
    const toast = find(container, '[role="status"]');
    expect(toast.getAttribute("data-tone")).toBe("error");
    expect([...toast.querySelectorAll("button")]).toHaveLength(1);
    unmount();
  });

  it("goes away when it is dismissed", () => {
    const { container, unmount } = page(info("gone"));
    raise(container, "gone");
    click(find(container, '[aria-label="Dismiss"]'));
    expect(container.querySelector('[role="status"]')).toBeNull();
    unmount();
  });

  it("takes itself away once its time is up", () => {
    vi.useFakeTimers();
    const { container, unmount } = page(info("gone"));
    raise(container, "gone");
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(TTL_MS));
    expect(container.querySelector('[role="status"]')).toBeNull();
    unmount();
  });

  it("replaces the one before it and starts its clock again", () => {
    vi.useFakeTimers();
    const { container, unmount } = page(info("first"), info("second"));
    raise(container, "first");
    act(() => vi.advanceTimersByTime(TTL_MS - 1));
    raise(container, "second");
    expect(find(container, '[role="status"]').textContent).toContain("second");
    act(() => vi.advanceTimersByTime(TTL_MS - 1));
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    unmount();
  });
});
