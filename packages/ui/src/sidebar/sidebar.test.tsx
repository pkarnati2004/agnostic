// @vitest-environment happy-dom
import type { Event, RepoListRow, TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { EMPTY_WORKSPACE, type WorkspaceState, workspaceReducer } from "../store/workspace-state";
import { render } from "../test/render";
import { groupTasks } from "./group-tasks";
import { Sidebar } from "./sidebar";

const PETAL: RepoListRow = {
  id: "r1",
  name: "petal",
  path: "/tmp/petal",
  kind: "git",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
};

const KATHA: RepoListRow = { ...PETAL, id: "r2", name: "katha", path: "/tmp/katha" };

const ASKING: TaskListRow = {
  id: "task1",
  repoId: "r1",
  title: "Fix the parser",
  prompt: "fix the parser",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/tmp/petal-wt",
  branch: "agn/fix-the-parser",
  status: "waiting",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  worktreePresent: true,
};

function loaded(): WorkspaceState {
  return workspaceReducer(EMPTY_WORKSPACE, {
    type: "loaded",
    repos: [PETAL, KATHA],
    tasks: [ASKING],
    cursor: 12,
  });
}

/** What the daemon sends on `agn repo close` and `agn repo open`: the whole row, status and all. */
function statusEvent(id: number, status: "active" | "archived"): Event {
  return {
    id,
    ts: "2026-09-14T10:05:00.000Z",
    taskId: undefined,
    kind: "repo.updated",
    payload: { repo: { ...PETAL, status } },
  } as Event;
}

function sidebar(state: WorkspaceState) {
  const groups = groupTasks(state.repos, Object.values(state.tasks));
  return (
    <TooltipProvider>
      <Sidebar
        groups={groups}
        selectedId={null}
        collapsed={false}
        onSelect={vi.fn()}
        onNewTask={vi.fn()}
        onToggle={vi.fn()}
      />
    </TooltipProvider>
  );
}

function headings(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("h2")).map((one) => one.textContent ?? "");
}

describe("the sidebar and a closed repo", () => {
  it("drops the repo and its waiting task when the feed says it was closed", () => {
    const page = render(sidebar(loaded()));
    expect(headings(page.container)).toEqual(["Needs you", "katha", "petal"]);

    const closed = workspaceReducer(loaded(), {
      type: "event",
      event: statusEvent(13, "archived"),
    });
    page.update(sidebar(closed));
    expect(headings(page.container)).toEqual(["katha"]);
    expect(page.container.textContent).not.toContain("Fix the parser");
    page.unmount();
  });

  it("puts them back when the feed says it was opened again", () => {
    const closed = workspaceReducer(loaded(), {
      type: "event",
      event: statusEvent(13, "archived"),
    });
    const opened = workspaceReducer(closed, { type: "event", event: statusEvent(14, "active") });
    const page = render(sidebar(opened));
    expect(headings(page.container)).toEqual(["Needs you", "katha", "petal"]);
    expect(page.container.textContent).toContain("Fix the parser");
    page.unmount();
  });
});
