// @vitest-environment happy-dom
import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import { CHANGES_KEY, readPanelOpen, writePanelOpen } from "../changes/panel-open";
import type { TaskNotice } from "../store/task-notices";
import { selectModifier } from "../terminal/select-modifier";
import { click, render } from "../test/render";
import { PROFILE, stubClient } from "../test/workspace-fixture";
import { TaskHeader } from "./task-header";

const REPO: RepoListRow = {
  id: "r1",
  path: "/repo",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-14T10:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

function task(id: string, title: string, over: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id,
    repoId: REPO.id,
    title,
    prompt: title,
    profileId: PROFILE.id,
    worktreePath: `/tmp/wt/${id}`,
    branch: "agn/one",
    status: "running",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    worktreePresent: true,
    ...over,
  };
}

function notice(taskLabel: string): TaskNotice {
  return {
    action: "stop",
    host: "header",
    error: new ApiError(`stop refused for ${taskLabel}`, { code: "x", status: 409 }),
    at: 1000,
  };
}

function header(
  activeTask: TaskListRow,
  taskNotice: TaskNotice | null,
  files: number | null = null,
) {
  return render(
    <TaskHeader
      task={activeTask}
      repo={REPO}
      profiles={[PROFILE]}
      budget={null}
      cost={null}
      client={stubClient()}
      files={files}
      notice={taskNotice}
      changesOpen={false}
      onToggleChanges={() => undefined}
      onStop={() => Promise.resolve()}
      onResume={() => Promise.resolve()}
      onHandoff={() => Promise.resolve(true)}
    />,
  );
}

describe("TaskHeader notice", () => {
  it("shows a notice that belongs to the task in front", () => {
    const active = task("task1", "Port the parser");
    const { container, unmount } = header(active, notice("task1"));
    expect(container.textContent).toContain("stop refused for task1");
    unmount();
  });

  it("shows nothing when the notice in state belongs to a different task", () => {
    const active = task("task1", "Port the parser");
    // The page keys notices by task id and only ever passes this task's own entry down; a header
    // given null (no entry for task1) must never fall back to showing someone else's failure.
    const { container, unmount } = header(active, null);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    unmount();
  });

  it("ignores a notice raised somewhere other than the header", () => {
    const active = task("task1", "Port the parser");
    const dialogNotice: TaskNotice = { ...notice("task1"), host: "dialog" };
    const { container, unmount } = header(active, dialogNotice);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    unmount();
  });

  it("swaps to the new task's own notice when the tab in front changes", () => {
    const first = task("task1", "Port the parser");
    const second = task("task2", "Cache rows");
    const { container, update, unmount } = header(first, notice("task1"));
    expect(container.textContent).toContain("stop refused for task1");

    update(
      <TaskHeader
        task={second}
        repo={REPO}
        profiles={[PROFILE]}
        budget={null}
        cost={null}
        client={stubClient()}
        files={null}
        notice={null}
        changesOpen={false}
        onToggleChanges={() => undefined}
        onStop={() => Promise.resolve()}
        onResume={() => Promise.resolve()}
        onHandoff={() => Promise.resolve(true)}
      />,
    );
    expect(container.textContent).not.toContain("stop refused for task1");
    unmount();
  });
});

function hasHandoff(container: HTMLElement): boolean {
  return Array.from(container.querySelectorAll("button")).some(
    (one) => one.textContent === "Hand off",
  );
}

describe("TaskHeader Hand off", () => {
  it("offers Hand off while the worktree agn made is there", () => {
    const { container, unmount } = header(task("task1", "Port the parser"), null);
    expect(hasHandoff(container)).toBe(true);
    unmount();
  });

  it("offers nothing to hand off once that worktree is gone", () => {
    const cleaned = task("task1", "Port the parser", { status: "stopped", worktreePresent: false });
    const { container, unmount } = header(cleaned, null);
    expect(hasHandoff(container)).toBe(false);
    // Resume is what brings the worktree, and the button, back.
    expect(container.textContent).toContain("Resume");
    unmount();
  });

  it("keeps Hand off for a folder task and for an adopted one: neither had a worktree", () => {
    const folder = task("task1", "Port the parser", {
      worktreePath: null,
      worktreePresent: false,
      branch: null,
    });
    const folderHeader = header(folder, null);
    expect(hasHandoff(folderHeader.container)).toBe(true);
    folderHeader.unmount();

    const adopted = task("task2", "Cache rows", {
      origin: "adopted",
      worktreePath: null,
      worktreePresent: false,
    });
    const adoptedHeader = header(adopted, null);
    expect(hasHandoff(adoptedHeader.container)).toBe(true);
    adoptedHeader.unmount();
  });
});

describe("TaskHeader and a closed repo", () => {
  it("still names the repo of a tab left open after its repo closed", () => {
    const closed: RepoListRow = { ...REPO, status: "archived" };
    const active = task("task1", "Port the parser");
    const { container, unmount } = render(
      <TaskHeader
        task={active}
        repo={closed}
        profiles={[PROFILE]}
        budget={null}
        cost={null}
        client={stubClient()}
        files={null}
        notice={null}
        changesOpen={false}
        onToggleChanges={() => undefined}
        onStop={() => Promise.resolve()}
        onResume={() => Promise.resolve()}
        onHandoff={() => Promise.resolve(true)}
      />,
    );
    expect(container.textContent).toContain("petal");
    unmount();
  });
});

describe("TaskHeader terminal hint", () => {
  it("says how to scroll and select while the task has a terminal to attach to", () => {
    const { container, unmount } = header(task("task1", "Port the parser"), null);
    expect(container.textContent).toContain("Wheel scrolls");
    expect(container.textContent).toContain(`${selectModifier()}+drag selects`);
    unmount();
  });

  it("says nothing for a queued task, which has no terminal yet", () => {
    const queued = task("task1", "Port the parser", { status: "queued" });
    const { container, unmount } = header(queued, null);
    expect(container.textContent).not.toContain("Wheel scrolls");
    unmount();
  });
});

/** Wires the toggle the way `app.tsx`'s `Workspace` does: `readPanelOpen`/`writePanelOpen` against
 * the real `localStorage`, not a fixture, so the test also proves the two agree on the key. */
function ChangesToggleHarness({ width }: { width: number }) {
  const [open, setOpen] = useState(() => readPanelOpen(window.localStorage, width));
  return (
    <TaskHeader
      task={task("task1", "Port the parser")}
      repo={REPO}
      profiles={[PROFILE]}
      budget={null}
      cost={null}
      client={stubClient()}
      files={null}
      notice={null}
      changesOpen={open}
      onToggleChanges={() => {
        writePanelOpen(window.localStorage, !open);
        setOpen(!open);
      }}
      onStop={() => Promise.resolve()}
      onResume={() => Promise.resolve()}
      onHandoff={() => Promise.resolve(true)}
    />
  );
}

function changesButton(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>("button[aria-pressed]");
  if (found === null) {
    throw new Error("no Changes toggle");
  }
  return found;
}

describe("TaskHeader Changes toggle", () => {
  it("flips aria-pressed and persists the choice to localStorage", () => {
    // A real, shared key: try/finally leaves it as this test found it, pass or fail.
    window.localStorage.removeItem(CHANGES_KEY);
    try {
      const { container, unmount } = render(<ChangesToggleHarness width={800} />);
      expect(changesButton(container).getAttribute("aria-pressed")).toBe("false");

      click(changesButton(container));
      expect(changesButton(container).getAttribute("aria-pressed")).toBe("true");
      expect(window.localStorage.getItem(CHANGES_KEY)).toBe("open");

      click(changesButton(container));
      expect(changesButton(container).getAttribute("aria-pressed")).toBe("false");
      expect(window.localStorage.getItem(CHANGES_KEY)).toBe("closed");
      unmount();
    } finally {
      window.localStorage.removeItem(CHANGES_KEY);
    }
  });

  it("starts open on a wide window once localStorage has never been told otherwise", () => {
    window.localStorage.removeItem(CHANGES_KEY);
    try {
      const { container, unmount } = render(<ChangesToggleHarness width={1440} />);
      expect(changesButton(container).getAttribute("aria-pressed")).toBe("true");
      unmount();
    } finally {
      window.localStorage.removeItem(CHANGES_KEY);
    }
  });
});
