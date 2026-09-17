// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import type { NoticeHost, TaskNotice } from "../store/task-notices";
import { click, find, render } from "../test/render";
import { type OverlayPhase, SessionOverlay } from "./session-overlay";

const never = () => new Promise<void>(() => undefined);
const TASK = { title: "Port the parser" };

function failure(host: NoticeHost): TaskNotice {
  return {
    action: "resume",
    host,
    error: new ApiError("the branch agn/port-the-parser is gone", {
      code: "worktree-missing",
      hint: "Start a new task from this one.",
      status: 409,
    }),
    at: 1000,
  };
}

function overlay(props: { phase: OverlayPhase; notice?: string; failure?: TaskNotice }) {
  return render(
    <SessionOverlay
      phase={props.phase}
      task={TASK}
      notice={props.notice ?? null}
      failure={props.failure ?? null}
      onResume={never}
    />,
  );
}

describe("SessionOverlay", () => {
  it("offers a resume when the session has ended", () => {
    const { container, unmount } = overlay({ phase: "ended" });
    expect(container.textContent).toContain("Session ended.");
    expect(find(container, "button").textContent).toBe("Resume");
    unmount();
  });

  it("asks once and waits", () => {
    const onResume = vi.fn(never);
    const { container, unmount } = render(
      <SessionOverlay phase="ended" task={TASK} notice={null} failure={null} onResume={onResume} />,
    );
    const button = find<HTMLButtonElement>(container, "button");
    click(button);
    click(button);
    expect(onResume).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    unmount();
  });

  it("shows what the close said while it reconnects", () => {
    const { container, unmount } = overlay({
      phase: "reconnecting",
      notice: "The daemon is restarting.",
    });
    expect(container.textContent).toContain("Reconnecting…");
    expect(container.textContent).toContain("The daemon is restarting.");
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });

  it("says which branch a resume rebuilt the worktree from", () => {
    const { container, unmount } = overlay({
      phase: "ended",
      notice: "Recreated from agn/x-t3n9v2wxyz.",
    });
    expect(container.textContent).toContain("Session ended.");
    expect(container.textContent).toContain("Recreated from agn/x-t3n9v2wxyz.");
    unmount();
  });

  it("says a resume started the harness fresh when its history was gone", () => {
    const { container, unmount } = overlay({
      phase: "ended",
      notice: "History was not recoverable; started claude-code fresh with the task context.",
    });
    expect(container.textContent).toContain("History was not recoverable");
    expect(container.textContent).toContain("started claude-code fresh with the task context.");
    unmount();
  });

  it("says the recreate before the fresh start when one resume did both", () => {
    const { container, unmount } = overlay({
      phase: "ended",
      notice:
        "Recreated from agn/x-t3n9v2wxyz. History was not recoverable; " +
        "started claude-code fresh with the task context.",
    });
    const text = container.textContent ?? "";
    expect(text.indexOf("Recreated from")).toBeLessThan(text.indexOf("History was not"));
    unmount();
  });

  it("says when a session cannot be attached to at all", () => {
    const { container, unmount } = overlay({ phase: "unattachable" });
    expect(container.textContent).toContain("agn can watch it but not attach");
    unmount();
  });

  it("says a queued task has not started yet", () => {
    const { container, unmount } = overlay({ phase: "starting" });
    expect(container.textContent).toContain("Starting…");
    unmount();
  });

  it("shows a resume that failed here, with its hint", () => {
    const { container, unmount } = overlay({ phase: "ended", failure: failure("overlay") });
    expect(container.textContent).toContain("Resume failed for Port the parser");
    expect(container.textContent).toContain("Start a new task from this one.");
    unmount();
  });

  it("leaves a failure raised in the header to the header", () => {
    const { container, unmount } = overlay({ phase: "ended", failure: failure("header") });
    expect(container.textContent).not.toContain("Resume failed");
    unmount();
  });
});
