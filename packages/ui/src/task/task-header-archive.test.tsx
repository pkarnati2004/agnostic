// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { act as reactAct } from "react";
import { describe, expect, it } from "vitest";
import type { TaskRowActions } from "../sidebar/task-row-actions";
import { render } from "../test/render";
import { headerTask, headerTree } from "./task-header-fixture";
import type { ArchiveNotice } from "./use-archive-delete";

function header(over: Partial<TaskListRow>, actions: Partial<TaskRowActions> = {}) {
  return render(headerTree(headerTask("task1", "Port the parser", over), { actions }));
}

function labels(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button")].map((one) => one.textContent ?? "");
}

/** Radix opens a menu on the pointer going down, not on the click that follows it. */
function openMenu(container: HTMLElement): string[] {
  const control = container.querySelector('[aria-label="More actions"]') as Element;
  reactAct(() => {
    control.dispatchEvent(
      new window.MouseEvent("pointerdown", { bubbles: true, button: 0, detail: 1 }),
    );
  });
  return [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent ?? "");
}

function warning(taskId: string, host: ArchiveNotice["host"] = "header"): ArchiveNotice {
  return {
    taskId,
    host,
    warning: { title: "3 files are not committed. Archive anyway?", body: "Archiving deletes …" },
    busy: false,
  };
}

describe("TaskHeader Archive", () => {
  it("offers Archive after Hand off once the agent is done with the worktree", () => {
    const { container, unmount } = header({ status: "done" });
    // The empty label is the overflow control, which carries an icon and an aria-label only.
    expect(labels(container)).toEqual(["Resume", "Hand off", "Archive", "", "Changes"]);
    unmount();
  });

  it("offers no Archive while the agent is still in the worktree", () => {
    const { container, unmount } = header({ status: "running" });
    expect(labels(container)).not.toContain("Archive");
    unmount();
  });

  it("offers no Archive for a task already in History", () => {
    const { container, unmount } = header({ status: "done", worktreePresent: false });
    expect(labels(container)).not.toContain("Archive");
    unmount();
  });
});

describe("TaskHeader overflow menu", () => {
  it("holds Delete and leaves out what the buttons beside it already are", () => {
    const { container, unmount } = header({ status: "done" });
    const rows = openMenu(container);
    expect(rows).toContain("Delete…");
    expect(rows).not.toContain("Resume");
    expect(rows).not.toContain("Archive");
    unmount();
  });
});

describe("TaskHeader archive warning", () => {
  it("answers a refused archive under the header rather than as a failure", () => {
    const { container, unmount } = header({ status: "done" }, { warning: warning("task1") });
    expect(container.textContent).toContain("3 files are not committed. Archive anyway?");
    expect(labels(container)).toContain("Archive anyway");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    unmount();
  });

  it("leaves another task's refused archive alone", () => {
    const { container, unmount } = header({ status: "done" }, { warning: warning("task9") });
    expect(container.textContent).not.toContain("Archive anyway?");
    unmount();
  });

  it("leaves a question asked from the row to the row", () => {
    const { container, unmount } = header({ status: "done" }, { warning: warning("task1", "row") });
    expect(container.textContent).not.toContain("Archive anyway?");
    unmount();
  });
});
