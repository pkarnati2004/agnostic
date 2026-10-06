// @vitest-environment happy-dom
import type { Event, RepoListRow, TaskListRow } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/error";
import { TooltipProvider } from "../components/tooltip";
import type { PaneColumn } from "../layout/workspace-columns";
import type { RepoNotices } from "../repo/repo-notices";
import { EMPTY_WORKSPACE, type WorkspaceState, workspaceReducer } from "../store/workspace-state";
import { click, find, render } from "../test/render";
import { WithRowActions } from "../test/workspace-fixture";
import { groupTasks } from "./group-tasks";
import { Sidebar } from "./sidebar";

/** The footer's state: a live feed and a version, which no test here is about. */
const DAEMON = { version: "1.2.0", connection: "live" } as const;
const NOW = Date.parse("2026-09-14T10:04:00.000Z");

const PETAL: RepoListRow = {
  id: "r1",
  name: "petal",
  path: "/tmp/petal",
  kind: "git",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
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
  compareId: null,
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

/** The page's column, which only the handle tests pass. */
const COLUMN: PaneColumn = { width: 240, min: 200, max: 400, set: vi.fn(), reset: vi.fn() };

type Handlers = {
  collapsed?: boolean;
  column?: PaneColumn;
  onAddRepo?: () => void;
  onCloseRepo?: (repoId: string) => Promise<void>;
  onReopenRepo?: (repoId: string) => Promise<void>;
  onRemoveRepo?: (repoId: string) => void;
  repoNotices?: RepoNotices;
};

function sidebar(state: WorkspaceState, handlers: Handlers = {}) {
  const groups = groupTasks(state.repos, Object.values(state.tasks));
  return (
    <TooltipProvider>
      <WithRowActions>
        <Sidebar
          groups={groups}
          repos={state.repos}
          selectedId={null}
          collapsed={handlers.collapsed ?? false}
          column={handlers.column}
          onSearch={vi.fn()}
          daemon={DAEMON}
          now={NOW}
          onSelect={vi.fn()}
          onOpenCompare={vi.fn()}
          onNewTask={vi.fn()}
          onAddRepo={handlers.onAddRepo ?? vi.fn()}
          onCloseRepo={handlers.onCloseRepo ?? (() => Promise.resolve())}
          onReopenRepo={handlers.onReopenRepo ?? (() => Promise.resolve())}
          onRemoveRepo={handlers.onRemoveRepo ?? vi.fn()}
          repoNotices={handlers.repoNotices ?? {}}
          onToggle={vi.fn()}
        />
      </WithRowActions>
    </TooltipProvider>
  );
}

function labelled(container: HTMLElement, label: string): HTMLButtonElement {
  return find<HTMLButtonElement>(container, `button[aria-label="${label}"]`);
}

function buttonSaying(container: HTMLElement, text: string): Element {
  const found = Array.from(container.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").startsWith(text),
  );
  if (found === undefined) {
    throw new Error(`no button saying "${text}"`);
  }
  return found;
}

function headings(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("h2")).map((one) => one.textContent ?? "");
}

describe("the sidebar and a closed repo", () => {
  it("drops the repo and its waiting task when the feed says it was closed", () => {
    const page = render(sidebar(loaded()));
    expect(headings(page.container)).toEqual(["Needs you", "Repos", "katha", "petal"]);

    const closed = workspaceReducer(loaded(), {
      type: "event",
      event: statusEvent(13, "archived"),
    });
    page.update(sidebar(closed));
    expect(headings(page.container)).toEqual(["Repos", "katha"]);
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
    expect(headings(page.container)).toEqual(["Needs you", "Repos", "katha", "petal"]);
    expect(page.container.textContent).toContain("Fix the parser");
    page.unmount();
  });
});

describe("managing repos from the sidebar", () => {
  it("offers Add a repo in the header and Close on every repo heading", () => {
    const onAddRepo = vi.fn();
    const page = render(sidebar(loaded(), { onAddRepo }));
    click(labelled(page.container, "Add a repo"));
    expect(onAddRepo).toHaveBeenCalledTimes(1);
    expect(labelled(page.container, "Close petal")).toBeDefined();
    expect(labelled(page.container, "Close katha")).toBeDefined();
    page.unmount();
  });

  it("closes the repo the click was on and waits for the daemon with the button flat", async () => {
    let settle: () => void = () => undefined;
    const onCloseRepo = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    const page = render(sidebar(loaded(), { onCloseRepo }));
    click(labelled(page.container, "Close petal"));
    expect(onCloseRepo).toHaveBeenCalledWith("r1");
    expect(labelled(page.container, "Close petal").disabled).toBe(true);
    await act(async () => settle());
    expect(labelled(page.container, "Close petal").disabled).toBe(false);
    page.unmount();
  });

  it("says under the heading what the daemon refused, message and hint", () => {
    const repoNotices: RepoNotices = {
      r1: {
        action: "close",
        at: 1000,
        error: new ApiError("repo petal has a task that is still running", {
          code: "repo-busy",
          hint: "Run `agn stop task1` first.",
          status: 409,
        }),
      },
    };
    const page = render(sidebar(loaded(), { repoNotices }));
    expect(page.container.textContent).toContain(
      "Close failed for petal: repo petal has a task that is still running",
    );
    expect(page.container.textContent).toContain("Run agn stop task1 first.");
    page.unmount();
  });

  it("draws a closed repo in the Closed section and nowhere else, reload or not", () => {
    const closed = workspaceReducer(loaded(), {
      type: "event",
      event: statusEvent(13, "archived"),
    });
    const onReopenRepo = vi.fn(() => Promise.resolve());
    const page = render(sidebar(closed, { onReopenRepo }));
    expect(headings(page.container)).toEqual(["Repos", "katha"]);
    expect(buttonSaying(page.container, "Closed").textContent).toBe("Closed1");
    expect(page.container.textContent).not.toContain("Fix the parser");

    click(buttonSaying(page.container, "Closed"));
    expect(page.container.textContent).toContain("Its usage and outcome history is kept.");
    click(buttonSaying(page.container, "Reopen"));
    expect(onReopenRepo).toHaveBeenCalledWith("r1");
    page.unmount();
  });

  it("marks a repo whose folder is gone and offers Remove on its heading only", () => {
    const onRemoveRepo = vi.fn();
    const state = loaded();
    const missing = {
      ...state,
      repos: state.repos.map((repo) => (repo.id === "r1" ? { ...repo, pathPresent: false } : repo)),
    };
    const page = render(sidebar(missing, { onRemoveRepo }));
    expect(page.container.textContent).toContain("Not found: /tmp/petal");
    expect(labelled(page.container, "Close petal")).toBeDefined();
    expect(labelled(page.container, "Close katha")).toBeDefined();
    // katha's folder is there, so its heading keeps the one action it had.
    expect(page.container.querySelector('button[aria-label="Remove katha"]')).toBeNull();

    click(labelled(page.container, "Remove petal"));
    expect(onRemoveRepo).toHaveBeenCalledWith("r1");
    page.unmount();
  });

  it("says nothing about a folder that is where agn left it", () => {
    const page = render(sidebar(loaded()));
    expect(page.container.textContent).not.toContain("Not found:");
    expect(page.container.querySelector('button[aria-label="Remove petal"]')).toBeNull();
    page.unmount();
  });

  it("carries a repo's notice with it when it reopens before the notice expires", () => {
    const repoNotices: RepoNotices = {
      r1: {
        action: "reopen",
        at: 1000,
        error: new ApiError("no repo matches r1", { code: "not-found", status: 404 }),
      },
    };
    const closed = workspaceReducer(loaded(), {
      type: "event",
      event: statusEvent(13, "archived"),
    });
    const page = render(sidebar(closed, { repoNotices }));
    click(buttonSaying(page.container, "Closed"));
    expect(page.container.textContent).toContain("Reopen failed for petal: no repo matches r1");

    // The notices map is keyed by repo id and outlives the repo's own status; a `repo.updated`
    // moving it back to active must carry the same, still-unexpired notice with it.
    const opened = workspaceReducer(closed, { type: "event", event: statusEvent(14, "active") });
    page.update(sidebar(opened, { repoNotices }));
    expect(headings(page.container)).toEqual(["Needs you", "Repos", "katha", "petal"]);
    expect(page.container.textContent).toContain("Reopen failed for petal: no repo matches r1");
    page.unmount();
  });
});

describe("the sidebar's resize handle", () => {
  it("sits on the expanded sidebar's right edge", () => {
    const page = render(sidebar(loaded(), { column: COLUMN }));
    const handles = page.container.querySelectorAll('[role="separator"]');

    expect(handles.length).toBe(1);
    expect(handles[0]?.getAttribute("aria-label")).toBe("Resize sidebar");
    page.unmount();
  });

  it("is not drawn on the rail", () => {
    const page = render(sidebar(loaded(), { column: COLUMN, collapsed: true }));

    expect(page.container.querySelectorAll('[role="separator"]').length).toBe(0);
    page.unmount();
  });
});
