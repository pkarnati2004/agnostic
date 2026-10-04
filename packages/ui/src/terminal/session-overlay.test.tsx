// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { taskRow } from "../changes/changes-fixture";
import type { NoticeHost, TaskNotice } from "../store/task-notices";
import { click, render } from "../test/render";
import { type OverlayPhase, SessionOverlay } from "./session-overlay";

const never = () => new Promise<void>(() => undefined);

const TASK = taskRow({ id: "t-8f2a", title: "Port the parser", branch: "agn/port-the-parser" });

const ADOPTED: TaskListRow = {
  ...TASK,
  id: "t-3c1e",
  origin: "adopted",
  worktreePath: null,
  session: {
    harness: "claude-code",
    sessionId: null,
    tmuxSession: null,
    tmuxSocket: null,
    launchId: null,
    pid: 48211,
    cwd: "/tmp/petal",
    lastSeenAt: "2026-09-20T10:00:00.000Z",
  },
};

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

type Options = {
  phase: OverlayPhase;
  task?: TaskListRow;
  notice?: string;
  failure?: TaskNotice;
  onResume?: () => Promise<void>;
  onHandoff?: () => void;
};

function overlay(options: Options) {
  const onResume = options.onResume ?? never;
  const onHandoff = options.onHandoff ?? vi.fn();
  return {
    onResume,
    onHandoff,
    ...render(
      <SessionOverlay
        phase={options.phase}
        task={options.task ?? TASK}
        notice={options.notice ?? null}
        failure={options.failure ?? null}
        onResume={onResume}
        onHandoff={onHandoff}
      />,
    ),
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((one) =>
    one.textContent?.startsWith(label),
  );
  if (found === undefined) {
    throw new Error(`no "${label}" row`);
  }
  return found;
}

describe("SessionOverlay with the session ended", () => {
  it("says the work is still there, and names the shell command for it", () => {
    const { container, unmount } = overlay({ phase: "ended" });
    expect(container.textContent).toContain("Session ended");
    expect(container.textContent).toContain("The worktree and its changes are intact.");
    expect(container.textContent).toContain("agn resume t-8f2a");
    unmount();
  });

  it("resumes the conversation, naming the harness and the branch", () => {
    const onResume = vi.fn(never);
    const { container, unmount } = overlay({ phase: "ended", onResume });
    const resume = button(container, "Resume session");
    expect(resume.textContent).toContain(
      "Reopens the conversation with claude-code in agn/port-the-parser",
    );
    click(resume);
    click(resume);
    expect(onResume).toHaveBeenCalledOnce();
    expect(resume.disabled).toBe(true);
    unmount();
  });

  it("hands the task to another agent", () => {
    const onHandoff = vi.fn();
    const { container, unmount } = overlay({ phase: "ended", onHandoff });
    click(button(container, "Hand off"));
    expect(onHandoff).toHaveBeenCalledOnce();
    unmount();
  });

  // Nothing to hand off: the next agent would have nowhere to work until a resume rebuilds it.
  it("offers no handoff once the worktree is gone", () => {
    const cleaned = { ...TASK, worktreePresent: false };
    const { container, unmount } = overlay({ phase: "ended", task: cleaned });
    expect(container.textContent).not.toContain("Hand off");
    unmount();
  });

  it("says what the last resume said in place of the standing line", () => {
    const { container, unmount } = overlay({
      phase: "ended",
      notice:
        "Recreated from agn/x-t3n9v2wxyz. History was not recoverable; " +
        "started claude-code fresh with the task context.",
    });
    const text = container.textContent ?? "";
    expect(text.indexOf("Recreated from")).toBeLessThan(text.indexOf("History was not"));
    expect(text).not.toContain("The worktree and its changes are intact.");
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

describe("SessionOverlay with a session it cannot attach to", () => {
  it("names the process and offers nothing to click", () => {
    const { container, unmount } = overlay({ phase: "unattachable", task: ADOPTED });
    expect(container.textContent).toContain("This session started outside tmux (pid 48211).");
    expect(container.textContent).toContain("cannot show or type into it");
    expect(container.textContent).toContain("Keep watching status");
    expect(container.textContent).toContain("agn status t-3c1e");
    expect(container.querySelector("button")).toBeNull();
    unmount();
  });
});

describe("SessionOverlay while a session is on its way", () => {
  it("says a queued task has not started yet", () => {
    const { container, unmount } = overlay({ phase: "starting" });
    expect(container.textContent).toContain("Starting…");
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
});
