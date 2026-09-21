// @vitest-environment happy-dom
import type { RepoListRow, Task } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/error";
import type { TaskNotice } from "../store/task-notices";
import { render } from "../test/render";
import { PROFILE } from "./new-task-dialog-fixture";
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

function task(id: string, title: string): Task {
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
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
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

function header(activeTask: Task, taskNotice: TaskNotice | null) {
  return render(
    <TaskHeader
      task={activeTask}
      repo={REPO}
      profiles={[PROFILE]}
      cost={null}
      notice={taskNotice}
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
        cost={null}
        notice={null}
        onStop={() => Promise.resolve()}
        onResume={() => Promise.resolve()}
        onHandoff={() => Promise.resolve(true)}
      />,
    );
    expect(container.textContent).not.toContain("stop refused for task1");
    unmount();
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
        cost={null}
        notice={null}
        onStop={() => Promise.resolve()}
        onResume={() => Promise.resolve()}
        onHandoff={() => Promise.resolve(true)}
      />,
    );
    expect(container.textContent).toContain("petal");
    unmount();
  });
});
