// @vitest-environment happy-dom
// What the header's two lines say and which of Stop and Resume it offers; `task-header.test.tsx`
// covers the notices, the handoff and the Changes toggle's own state.
import { describe, expect, it, vi } from "vitest";
import { PROFILE } from "../test/workspace-fixture";
import { headerTask, renderHeader } from "./task-header-fixture";

/** The Changes toggle is the one control in the header that reports whether it is pressed. */
function changesToggle(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>("button[aria-pressed]");
  if (found === null) {
    throw new Error("no Changes toggle");
  }
  return found;
}

/** The names of the buttons, because "Stopped" in the status pill is not a Stop button. */
function buttonNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button")).map((one) => one.textContent ?? "");
}

/** The task in front asks for one thing at a time: the daemon refuses a stop on a finished task
 * and a resume on a live one, so the header offers whichever of the two would work. */
describe("TaskHeader Stop and Resume", () => {
  it("offers Stop while the agent is running, and no Resume", () => {
    const { container, unmount } = renderHeader(headerTask("task1", "Port the parser"));
    expect(buttonNames(container)).toContain("Stop");
    expect(buttonNames(container)).not.toContain("Resume");
    unmount();
  });

  it("offers Resume once the task has stopped, and no Stop", () => {
    const stopped = headerTask("task1", "Port the parser", { status: "stopped" });
    const { container, unmount } = renderHeader(stopped, null);
    expect(buttonNames(container)).toContain("Resume");
    expect(buttonNames(container)).not.toContain("Stop");
    unmount();
  });

  it("offers neither while the tests before launch are still running", () => {
    const queued = headerTask("task1", "Port the parser", { status: "queued" });
    const { container, unmount } = renderHeader(queued, null);
    expect(buttonNames(container)).not.toContain("Stop");
    expect(buttonNames(container)).not.toContain("Resume");
    unmount();
  });

  // The daemon groups running and waiting as stoppable, and done, stopped and failed as resumable;
  // this pins the header's two lists to that same split rather than one status at a time.
  it("offers Stop for a task waiting on an answer, same as a running one", () => {
    const waiting = headerTask("task1", "Port the parser", { status: "waiting" });
    const { container, unmount } = renderHeader(waiting, null);
    expect(buttonNames(container)).toContain("Stop");
    expect(buttonNames(container)).not.toContain("Resume");
    unmount();
  });

  it("offers Resume for a task that finished on its own, same as a stopped one", () => {
    const done = headerTask("task1", "Port the parser", { status: "done" });
    const { container, unmount } = renderHeader(done, null);
    expect(buttonNames(container)).toContain("Resume");
    expect(buttonNames(container)).not.toContain("Stop");
    unmount();
  });

  it("offers Resume for a task that failed, same as a stopped one", () => {
    const failed = headerTask("task1", "Port the parser", { status: "failed" });
    const { container, unmount } = renderHeader(failed, null);
    expect(buttonNames(container)).toContain("Resume");
    expect(buttonNames(container)).not.toContain("Stop");
    unmount();
  });
});

describe("TaskHeader status line", () => {
  it("says how long a waiting task has waited, beside the word", () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-14T10:04:00.000Z") });
    try {
      const waiting = headerTask("task1", "Port the parser", { status: "waiting" });
      const { container, unmount } = renderHeader(waiting, null);
      expect(container.textContent).toContain("Waiting for you · 4m");
      // createdAt is an hour older than updatedAt: the two clocks are not the same clock.
      expect(container.textContent).toContain("1h 4m elapsed");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the harness and the model, and what the profile costs", () => {
    const { container, unmount } = renderHeader(headerTask("task1", "Port the parser"));
    expect(container.textContent).toContain("claude-code · opus");
    expect(container.textContent).toContain("included in plan");
    expect(container.textContent).not.toContain(PROFILE.id);
    unmount();
  });

  it("names the branch and the repo the task runs in", () => {
    const { container, unmount } = renderHeader(headerTask("task1", "Port the parser"));
    expect(container.textContent).toContain("petal");
    expect(container.textContent).toContain("agn/one");
    unmount();
  });
});

describe("TaskHeader Changes count", () => {
  it("counts the files the panel last read, and drops the count once the panel is open", () => {
    const closed = renderHeader(headerTask("task1", "Port the parser"), 4);
    expect(changesToggle(closed.container).textContent).toBe("Changes4");
    expect(changesToggle(closed.container).getAttribute("aria-pressed")).toBe("false");
    closed.unmount();
  });

  it("says Changes alone before the panel has read the task", () => {
    const { container, unmount } = renderHeader(headerTask("task1", "Port the parser"));
    expect(changesToggle(container).textContent).toBe("Changes");
    unmount();
  });
});
