// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { TooltipProvider } from "../components/tooltip";
import type { TaskRowActions } from "../sidebar/task-row-actions";
import { click, render } from "../test/render";
import { WithRowActions } from "../test/workspace-fixture";
import { TaskMenu } from "./task-menu";

type MenuProps = Omit<Parameters<typeof TaskMenu>[0], "task" | "placement" | "trigger"> & {
  task?: TaskListRow;
};

function menu(over: Partial<MenuProps> = {}, actions: Partial<TaskRowActions> = {}) {
  const onKeep = over.onKeep ?? vi.fn();
  return {
    onKeep,
    ...render(
      <TooltipProvider>
        <WithRowActions actions={actions}>
          <TaskMenu
            task={over.task ?? taskRow({ status: "done" })}
            placement="row"
            open={over.open ?? true}
            onOpenChange={over.onOpenChange ?? (() => undefined)}
            warning={over.warning ?? null}
            busy={over.busy ?? false}
            onKeep={onKeep}
            trigger={
              <button type="button" aria-label="Actions">
                …
              </button>
            }
          />
        </WithRowActions>
      </TooltipProvider>,
    ),
  };
}

/** Radix portals the menu to the document, so its rows are read from there. */
function items(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

function item(label: string): HTMLElement {
  const found = items().find((one) => one.textContent?.startsWith(label));
  if (found === undefined) {
    throw new Error(`no "${label}" row in ${items().map((one) => one.textContent)}`);
  }
  return found;
}

describe("TaskMenu", () => {
  it("draws the rows the task has, in the design's order", () => {
    const { unmount } = menu();
    expect(items().map((one) => one.textContent)).toEqual([
      "Copy branch name",
      `Copy task idtask1`,
      "Open in editor",
      "Resume",
      "Hand off",
      "Create PR",
      "Archive",
      "Delete…",
    ]);
    unmount();
  });

  it("says why a row is disabled in the row itself, where it can be read", () => {
    const { unmount } = menu({ task: taskRow({ status: "running" }) });
    const row = item("Delete…");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    // A disabled item takes no pointer and no keyboard focus, so the reason cannot be a tooltip.
    expect(row.textContent).toContain("Stop the task first");
    expect(row.hasAttribute("title")).toBe(false);
    unmount();
  });

  it("puts the Archive sentence where a hover can reach it", () => {
    const { unmount } = menu();
    expect(item("Archive").getAttribute("title")).toBe(
      "Removes the worktree. The task moves to History; Resume rebuilds it from its branch.",
    );
    unmount();
  });

  it("marks the one row that deletes something", () => {
    const { unmount } = menu();
    expect(item("Delete…").getAttribute("data-tone")).toBe("destructive");
    unmount();
  });

  it("copies the branch, the id and the attach command", () => {
    const copy = vi.fn(() => Promise.resolve());
    const running = menu({ task: taskRow({ status: "running" }) }, { copy });
    click(item("Copy branch name"));
    click(item("Copy task id"));
    click(item("Copy attach command"));
    expect(copy.mock.calls).toEqual([["agn/invite-links-a1b2"], ["task1"], ["agn attach task1"]]);
    running.unmount();
  });

  it("asks the page for each lifecycle row it draws", () => {
    const resume = vi.fn();
    const handoff = vi.fn();
    const createPr = vi.fn();
    const requestDelete = vi.fn();
    const { unmount } = menu({}, { resume, handoff, createPr, requestDelete });
    click(item("Resume"));
    click(item("Hand off"));
    click(item("Create PR"));
    click(item("Delete…"));
    expect([resume, handoff, createPr, requestDelete].map((one) => one.mock.calls)).toEqual([
      [["task1"]],
      [["task1"]],
      [["task1"]],
      [["task1"]],
    ]);
    unmount();
  });

  it("swaps its rows for the warning when the daemon held the worktree back", () => {
    const archiveAnyway = vi.fn(() => Promise.resolve());
    const { onKeep, unmount } = menu(
      { warning: { title: "3 files are not committed. Archive anyway?", body: "Archiving …" } },
      { archiveAnyway },
    );
    expect(items()).toHaveLength(0);
    expect(document.body.textContent).toContain("3 files are not committed. Archive anyway?");
    click(button("Keep"));
    expect(onKeep).toHaveBeenCalledOnce();
    click(button("Archive anyway"));
    expect(archiveAnyway).toHaveBeenCalledWith("task1");
    unmount();
  });
});

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((one) => one.textContent === label);
  if (found === undefined) {
    throw new Error(`no "${label}" button`);
  }
  return found;
}
