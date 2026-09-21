// @vitest-environment happy-dom
import type { RepoListRow, TaskListRow, TaskStatus } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import type { SidebarGroups } from "./group-tasks";
import { HistorySection } from "./history-section";
import { Sidebar } from "./sidebar";

const REPO: RepoListRow = {
  id: "r1",
  name: "petal",
  path: "/tmp/petal",
  kind: "git",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

function task(id: string, status: TaskStatus): TaskListRow {
  return {
    id,
    repoId: REPO.id,
    title: id,
    prompt: id,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: `/tmp/wt/${id}`,
    branch: "agn/one",
    status,
    origin: "agn",
    baseCommit: null,
    createdAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    worktreePresent: status === "running",
  };
}

const GROUPS: SidebarGroups = {
  needsYou: [],
  repos: [
    {
      repo: REPO,
      tasks: [task("live", "running")],
      history: [task("old-one", "done"), task("old-two", "stopped")],
    },
  ],
};

function sidebar(onSelect: (id: string) => void = vi.fn()) {
  return render(
    <TooltipProvider>
      <Sidebar
        groups={GROUPS}
        repos={[REPO]}
        selectedId={null}
        collapsed={false}
        onSelect={onSelect}
        onNewTask={vi.fn()}
        onAddRepo={vi.fn()}
        onCloseRepo={() => Promise.resolve()}
        onReopenRepo={() => Promise.resolve()}
        onRemoveRepo={vi.fn()}
        repoNotices={{}}
        onToggle={vi.fn()}
      />
    </TooltipProvider>,
  );
}

function rowTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("button"))
    .map((button) => button.textContent ?? "")
    .filter((text) => text.includes("agn/one"));
}

function toggle(container: HTMLElement): Element {
  const found = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.startsWith("History"),
  );
  if (found === undefined) {
    throw new Error("no History button");
  }
  return found;
}

describe("HistorySection", () => {
  it("counts a repo's finished tasks and keeps them folded away", () => {
    const { container, unmount } = sidebar();
    expect(toggle(container).textContent).toBe("History (2)");
    expect(rowTitles(container)).toHaveLength(1);
    unmount();
  });

  it("shows the rows when the heading is clicked, and folds them again", () => {
    const { container, unmount } = sidebar();
    click(toggle(container));
    expect(rowTitles(container)).toHaveLength(3);
    click(toggle(container));
    expect(rowTitles(container)).toHaveLength(1);
    unmount();
  });

  it("opens a history task like any other row", () => {
    const onSelect = vi.fn();
    const { container, unmount } = sidebar(onSelect);
    click(toggle(container));
    const row = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.startsWith("old-two"),
    );
    click(row as Element);
    expect(onSelect).toHaveBeenCalledWith("old-two");
    unmount();
  });

  it("says nothing at all for a repo with no history", () => {
    const { container, unmount } = render(
      <HistorySection
        repoId={REPO.id}
        tasks={[]}
        selectedId={null}
        expanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
    unmount();
  });

  it("keeps a repo's expansion across a re-render with the same groups", () => {
    const { container, update, unmount } = sidebar();
    click(toggle(container));
    expect(rowTitles(container)).toHaveLength(3);

    // Expansion lives in the sidebar's own state; a re-render (a fresh event, a poll) with a new
    // `groups` object must not reset it the way a fresh mount would.
    update(
      <TooltipProvider>
        <Sidebar
          groups={{ ...GROUPS, repos: [...GROUPS.repos] }}
          repos={[REPO]}
          onAddRepo={vi.fn()}
          onCloseRepo={() => Promise.resolve()}
          onReopenRepo={() => Promise.resolve()}
          onRemoveRepo={vi.fn()}
          repoNotices={{}}
          selectedId={null}
          collapsed={false}
          onSelect={vi.fn()}
          onNewTask={vi.fn()}
          onToggle={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(rowTitles(container)).toHaveLength(3);
    unmount();
  });

  it("shows the section the selected task is in, unopened", () => {
    const { container, unmount } = render(
      <TooltipProvider>
        <Sidebar
          groups={GROUPS}
          repos={[REPO]}
          onAddRepo={vi.fn()}
          onCloseRepo={() => Promise.resolve()}
          onReopenRepo={() => Promise.resolve()}
          onRemoveRepo={vi.fn()}
          repoNotices={{}}
          selectedId="old-two"
          collapsed={false}
          onSelect={vi.fn()}
          onNewTask={vi.fn()}
          onToggle={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(rowTitles(container)).toHaveLength(3);
    unmount();
  });
});
