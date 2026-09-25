// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { TooltipProvider } from "../components/tooltip";
import { click, find, render } from "../test/render";
import { TaskRow } from "./task-row";

function row(props: Partial<Parameters<typeof TaskRow>[0]> = {}) {
  const onSelect = vi.fn();
  const rendered = render(
    <TooltipProvider>
      <TaskRow
        task={taskRow({ title: "Port the parser" })}
        repo={null}
        selected={false}
        onSelect={onSelect}
        {...props}
      />
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
