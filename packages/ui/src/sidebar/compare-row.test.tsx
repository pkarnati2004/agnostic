// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { TooltipProvider } from "../components/tooltip";
import { click, find, render } from "../test/render";
import { CompareRow } from "./compare-row";
import type { CompareGroup } from "./group-tasks";

function sibling(id: string, over: Partial<TaskListRow> = {}): TaskListRow {
  return taskRow({ id, compareId: "cmp1", title: "Try two parsers", ...over });
}

const GROUP: CompareGroup = {
  compareId: "cmp1",
  title: "Try two parsers",
  tasks: [sibling("task1"), sibling("task2", { profileId: "codex:gpt-5-codex:native" })],
};

function row(props: Partial<Parameters<typeof CompareRow>[0]> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onOpenCompare: vi.fn(),
    onSelect: vi.fn(),
  };
  const rendered = render(
    <TooltipProvider>
      <CompareRow group={GROUP} selectedId={null} expanded={false} {...handlers} {...props} />
    </TooltipProvider>,
  );
  return { ...rendered, ...handlers };
}

describe("CompareRow", () => {
  it("names the compare and says what its agents are doing", () => {
    const { container, unmount } = row();
    expect(container.textContent).toContain("Try two parsers");
    expect(container.textContent).toContain("compare · 2 agents · 2 running");
    unmount();
  });

  // The daemon's `pickedTaskId` is the only word on a pick, and the Compare view is where it is
  // read: a worktree removed by hand must not make this row claim one agent was chosen.
  it("says nothing about a pick, whatever became of the worktrees", () => {
    const cleaned = {
      ...GROUP,
      tasks: [
        GROUP.tasks[0] as TaskListRow,
        sibling("task2", { status: "stopped", worktreePresent: false }),
      ],
    };
    const { container, unmount } = row({ group: cleaned });
    expect(container.textContent).toContain("compare · 2 agents · 1 running, 1 stopped");
    expect(container.textContent).not.toContain("picked");
    unmount();
  });

  it("lists the siblings only once the chevron is clicked", () => {
    const collapsed = row();
    expect(collapsed.container.querySelectorAll("button")).toHaveLength(2);
    click(find(collapsed.container, "[aria-expanded]"));
    expect(collapsed.onToggle).toHaveBeenCalledWith("cmp1");
    collapsed.unmount();

    const open = row({ expanded: true });
    expect(open.container.textContent).toContain("codex:gpt-5-codex:native");
    expect(open.container.querySelectorAll("button")).toHaveLength(4);
    open.unmount();
  });

  it("opens the Compare view from the title and a sibling from its own row", () => {
    const { container, onOpenCompare, onSelect, unmount } = row({ expanded: true });
    const buttons = [...container.querySelectorAll("button")];
    click(buttons[1] as Element);
    expect(onOpenCompare).toHaveBeenCalledWith("cmp1");
    click(buttons[2] as Element);
    expect(onSelect).toHaveBeenCalledWith("task1");
    unmount();
  });

  it("marks itself while its own tab is in front", () => {
    const { container, unmount } = row({ selectedId: "compare:cmp1" });
    expect(find(container, "[aria-expanded]").parentElement?.className).toContain(
      "bg-sidebar-accent",
    );
    unmount();
  });
});
