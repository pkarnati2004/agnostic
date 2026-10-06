// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { TooltipProvider } from "../components/tooltip";
import { click, find, render } from "../test/render";
import { WithRowActions } from "../test/workspace-fixture";
import { TaskRow } from "./task-row";
import type { TaskRowActions } from "./task-row-actions";

function row(
  props: Partial<Parameters<typeof TaskRow>[0]> = {},
  actions: Partial<TaskRowActions> = {},
) {
  const onSelect = vi.fn();
  const rendered = render(
    <TooltipProvider>
      <WithRowActions actions={actions}>
        <TaskRow
          task={taskRow({ title: "Port the parser" })}
          repo={null}
          selected={false}
          onSelect={onSelect}
          {...props}
        />
      </WithRowActions>
    </TooltipProvider>,
  );
  return { ...rendered, onSelect, button: find<HTMLButtonElement>(rendered.container, "button") };
}

describe("TaskRow", () => {
  it("carries the status, the selection and the cleaned worktree as data the CSS reads", () => {
    const cleaned: Partial<TaskListRow> = { status: "done", worktreePresent: false };
    const { button, unmount } = row({ task: taskRow(cleaned), selected: true });
    expect(button.getAttribute("data-status")).toBe("done");
    expect(button.getAttribute("data-selected")).toBe("true");
    expect(button.getAttribute("data-cleaned")).toBe("true");
    expect(button.className).toContain("opacity-55");
    unmount();
  });

  it("gives the row in front a left edge while its task is waiting for an answer", () => {
    const { button, unmount } = row({ task: taskRow({ status: "waiting" }), selected: true });
    expect(button.className).toContain("inset_2px");
    unmount();
  });

  it("marks the harness rather than printing the profile id", () => {
    const { container, button, unmount } = row();
    expect(button.textContent).not.toContain("claude-code:sonnet-4.5:native");
    expect(find(container, "[role='img']").getAttribute("aria-label")).toBe("claude-code");
    unmount();
  });

  it("indents a handed-off child and says which harness it came from", () => {
    const parent = taskRow({ id: "task1", profileId: "claude-code:fable:native" });
    const child = taskRow({ id: "task2", profileId: "codex:default:native" });
    const { button, unmount } = row({ task: child, parent });
    expect(button.getAttribute("data-child")).toBe("true");
    expect(button.textContent).toContain("From claude-code");
    expect(button.className).toContain("pl-[22px]");
    unmount();
  });

  it("opens the task it was clicked on", () => {
    const { button, onSelect, unmount } = row();
    click(button);
    expect(onSelect).toHaveBeenCalledWith("task1");
    unmount();
  });
});

function rightClick(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
  });
}

function menuItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

describe("TaskRow menu", () => {
  it("has no control of its own; Shift+F10 on the focused row opens the menu", () => {
    const { container, onSelect, unmount } = row({ task: taskRow({ status: "done" }) });
    expect(container.querySelector('[aria-label^="Actions for"]')).toBeNull();
    expect(menuItems()).toHaveLength(0);

    act(() => {
      find(container, "button").dispatchEvent(
        new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
      );
    });
    expect(menuItems().length).toBeGreaterThan(0);
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });

  it("opens the same menu on a right-click anywhere in the row", () => {
    const { container, unmount } = row({ task: taskRow({ status: "done" }) });
    rightClick(find(container, "button"));
    expect(menuItems().map((one) => one.textContent)).toContain("Archive");
    // The mark's place says the menu is open.
    expect(container.querySelector("svg.lucide-ellipsis")).not.toBeNull();
    unmount();
  });

  it("does not select the row when the click was in its menu", () => {
    const { container, onSelect, unmount } = row({ task: taskRow({ status: "done" }) });
    rightClick(find(container, "button"));
    const copy = menuItems().find((one) => one.textContent === "Copy branch name");
    click(copy as Element);
    expect(onSelect).not.toHaveBeenCalled();
    unmount();
  });
});

describe("TaskRow with the Archive anyway card up", () => {
  it("leaves a question asked from the header to the header", () => {
    const { container, unmount } = row(
      { task: taskRow({ status: "done" }) },
      {
        warning: {
          taskId: "task1",
          host: "header",
          warning: { title: "3 files are not committed. Archive anyway?", body: "Archiving …" },
          busy: false,
        },
      },
    );
    rightClick(find(container, "button"));
    expect(document.body.textContent).not.toContain("Archive anyway?");
    unmount();
  });

  it("treats closing the menu as Keep", () => {
    const keep = vi.fn();
    const { container, unmount } = row(
      { task: taskRow({ status: "done" }) },
      {
        warning: {
          taskId: "task1",
          host: "row",
          warning: { title: "3 files are not committed. Archive anyway?", body: "Archiving …" },
          busy: false,
        },
        keep,
      },
    );
    rightClick(find(container, "button"));
    expect(document.body.textContent).toContain("Archive anyway?");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(keep).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("TaskRow just after an archive", () => {
  it("highlights the row and says so, in place of the branch", () => {
    const archived = taskRow({ status: "done", worktreePresent: false });
    const { button, unmount } = row({ task: archived }, { justArchived: "task1" });
    expect(button.getAttribute("data-archived")).toBe("true");
    expect(button.className).toContain("bg-sidebar-accent");
    expect(button.textContent).toContain("Archived just now");
    expect(button.textContent).not.toContain("agn/invite-links-a1b2");
    unmount();
  });

  it("leaves every other row as it was", () => {
    const { button, unmount } = row({}, { justArchived: "task9" });
    expect(button.getAttribute("data-archived")).toBe("false");
    expect(button.textContent).toContain("agn/invite-links-a1b2");
    unmount();
  });
});
