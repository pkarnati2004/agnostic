// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, asApiError } from "../api/error";
import { SessionOverlay } from "../terminal/session-overlay";
import { render } from "../test/render";
import { useNotices } from "./notice-store";
import type { TaskNotice } from "./task-notices";

const TTL_MS = 5000;
const TASK = { id: "task1", title: "Port the parser" };

const REFUSED = new ApiError("the worktree /tmp/petal-wt is gone", {
  code: "worktree-missing",
  hint: "Start a new task from this one.",
  status: 409,
});

/** One task's pane, wired the way the page wires it: the answer to Resume shows on the overlay. */
function Pane({ resume }: { resume: () => Promise<void> }) {
  const { notices, failed, cleared } = useNotices<Omit<TaskNotice, "at">>(TTL_MS);
  const onResume = () =>
    resume().then(
      () => cleared(TASK.id),
      (cause: unknown) =>
        failed(TASK.id, { action: "resume", host: "overlay", error: asApiError(cause) }),
    );
  return (
    <SessionOverlay
      phase="ended"
      task={TASK}
      notice={null}
      failure={notices[TASK.id] ?? null}
      onResume={onResume}
    />
  );
}

async function clickResume(container: HTMLElement): Promise<void> {
  const button = container.querySelector("button");
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("useNotices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a refused resume on the overlay that asked for it, then takes it away", async () => {
    const { container, unmount } = render(<Pane resume={() => Promise.reject(REFUSED)} />);
    await clickResume(container);

    expect(container.textContent).toContain("Resume failed for Port the parser");
    expect(container.textContent).toContain("the worktree /tmp/petal-wt is gone");
    expect(container.textContent).toContain("Start a new task from this one.");

    await act(async () => {
      vi.advanceTimersByTime(TTL_MS);
    });
    expect(container.textContent).not.toContain("Resume failed");
    unmount();
  });

  it("clears the notice as soon as the same task answers", async () => {
    let refuse = true;
    const resume = () => (refuse ? Promise.reject(REFUSED) : Promise.resolve());
    const { container, unmount } = render(<Pane resume={resume} />);
    await clickResume(container);
    expect(container.textContent).toContain("Resume failed");

    refuse = false;
    await clickResume(container);
    expect(container.textContent).not.toContain("Resume failed");
    unmount();
  });

  it("clears its pending timer on unmount, so a slow answer never reaches a gone component", async () => {
    const { container, unmount } = render(<Pane resume={() => Promise.reject(REFUSED)} />);
    await clickResume(container);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps one timer per task, replacing it on a second failure and dropping it on success", async () => {
    let refuse = true;
    const resume = () => (refuse ? Promise.reject(REFUSED) : Promise.resolve());
    const { container, unmount } = render(<Pane resume={resume} />);

    await clickResume(container);
    expect(vi.getTimerCount()).toBe(1);

    // A second failure replaces the first, so the first failure's timer goes with it.
    await clickResume(container);
    expect(vi.getTimerCount()).toBe(1);

    refuse = false;
    await clickResume(container);
    expect(container.textContent).not.toContain("Resume failed");
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it("keeps a replaced notice past the older failure's own deadline, then clears on its own", async () => {
    const FIRST = new ApiError("stop refused: session busy", { code: "session-busy", status: 409 });
    let call = 0;
    const resume = () => Promise.reject(call++ === 0 ? FIRST : REFUSED);
    const { container, unmount } = render(<Pane resume={resume} />);

    await clickResume(container);
    expect(container.textContent).toContain("stop refused: session busy");

    await act(async () => {
      vi.advanceTimersByTime(TTL_MS / 2);
    });
    await clickResume(container);
    expect(container.textContent).toContain("the worktree /tmp/petal-wt is gone");

    // The first failure's own timer fires here; it must not remove the second, newer notice.
    await act(async () => {
      vi.advanceTimersByTime(TTL_MS / 2);
    });
    expect(container.textContent).toContain("the worktree /tmp/petal-wt is gone");

    // The second notice's own deadline: now it clears.
    await act(async () => {
      vi.advanceTimersByTime(TTL_MS / 2);
    });
    expect(container.textContent).not.toContain("Resume failed");
    unmount();
  });
});
