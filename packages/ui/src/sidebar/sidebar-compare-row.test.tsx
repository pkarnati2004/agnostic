// @vitest-environment happy-dom
// The sidebar's own state around a compare row: what a click on its chevron does to it, and
// whether that survives a re-render the way the repo and History sections' own expansion does
// (sidebar.test.tsx, history-section.test.tsx).
import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { EMPTY_WORKSPACE, type WorkspaceState, workspaceReducer } from "../store/workspace-state";
import { click, find, render } from "../test/render";
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
  pathPresent: true,
};

const SIB_A: TaskListRow = {
  id: "sib-a",
  repoId: PETAL.id,
  title: "Try two parsers",
  prompt: "try two parsers",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: "/tmp/wt/sib-a",
  branch: "agn/one",
  status: "running",
  origin: "agn",
  baseCommit: null,
  compareId: "cmp1",
  createdAt: "2026-09-14T09:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  worktreePresent: true,
};

const SIB_B: TaskListRow = {
  ...SIB_A,
  id: "sib-b",
  profileId: "codex:gpt-5-codex:native",
  worktreePath: "/tmp/wt/sib-b",
  createdAt: "2026-09-14T09:01:00.000Z",
};

function withCompare(cursor: number): WorkspaceState {
  return workspaceReducer(EMPTY_WORKSPACE, {
    type: "loaded",
    repos: [PETAL],
    tasks: [SIB_A, SIB_B],
    cursor,
  });
}

function sidebar(state: WorkspaceState) {
  const groups = groupTasks(state.repos, Object.values(state.tasks));
  return (
    <TooltipProvider>
      <Sidebar
        groups={groups}
        repos={state.repos}
        selectedId={null}
        collapsed={false}
        onSelect={vi.fn()}
        onOpenCompare={vi.fn()}
        onNewTask={vi.fn()}
        onAddRepo={vi.fn()}
        onCloseRepo={() => Promise.resolve()}
        onReopenRepo={() => Promise.resolve()}
        onRemoveRepo={vi.fn()}
        repoNotices={{}}
        onToggle={vi.fn()}
      />
    </TooltipProvider>
  );
}

function labelled(container: HTMLElement, label: string): HTMLButtonElement {
  return find<HTMLButtonElement>(container, `button[aria-label="${label}"]`);
}

describe("a compare row's expansion", () => {
  it("keeps a collapse the user chose across a re-render with a fresh groups object", () => {
    const page = render(sidebar(withCompare(12)));
    expect(labelled(page.container, "Hide the agents of Try two parsers")).toBeDefined();
    expect(page.container.querySelector('[aria-label="codex"]')).not.toBeNull();

    click(labelled(page.container, "Hide the agents of Try two parsers"));
    expect(page.container.querySelector('button[aria-label^="Hide the agents of"]')).toBeNull();
    expect(page.container.querySelector('[aria-label="codex"]')).toBeNull();

    // Collapse state lives in the sidebar's own state, keyed by compareId; a re-render with a new
    // `groups` object (a fresh event, a poll) must not reopen it the way a fresh mount would.
    page.update(sidebar(withCompare(13)));
    expect(labelled(page.container, "Show the agents of Try two parsers")).toBeDefined();
    expect(page.container.querySelector('[aria-label="codex"]')).toBeNull();
    page.unmount();
  });
});
