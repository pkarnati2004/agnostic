// @vitest-environment happy-dom
import type { TaskListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { click, find, render } from "../test/render";
import { NeedsYou } from "./needs-you";

const NOW = Date.parse("2026-09-20T10:04:00.000Z");

const REPO_NAMES = new Map([
  ["repo1", "petal"],
  ["repo2", "katha"],
]);

const ASKED_4M = taskRow({
  id: "task1",
  title: "Add the invite links",
  status: "waiting",
  updatedAt: "2026-09-20T10:00:00.000Z",
});

const ASKED_12M: TaskListRow = {
  ...taskRow({ id: "task2", title: "Port the parser", status: "waiting" }),
  repoId: "repo2",
  updatedAt: "2026-09-20T09:52:00.000Z",
};

function strip(tasks: TaskListRow[], onSelect = vi.fn()) {
  return {
    onSelect,
    ...render(
      <NeedsYou
        tasks={tasks}
        repoNames={REPO_NAMES}
        selectedId={null}
        now={NOW}
        onSelect={onSelect}
      />,
    ),
  };
}

function titles(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("button")).map((row) => row.getAttribute("title"));
}

describe("NeedsYou", () => {
  it("lists what is waiting, with how long each has waited", () => {
    const { container, unmount } = strip([ASKED_4M, ASKED_12M]);
    const rows = container.querySelectorAll("button");
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain("Add the invite links");
    expect(rows[0]?.textContent).toContain("4m");
    expect(rows[1]?.textContent).toContain("12m");
    unmount();
  });

  it("counts them beside the heading", () => {
    const { container, unmount } = strip([ASKED_4M, ASKED_12M]);
    expect(find(container, '[data-slot="badge"]').textContent).toBe("2");
    unmount();
  });

  // The repo is in the title rather than the row: a question is about the task, not where it is.
  it("names the repo in the row's tooltip", () => {
    const { container, unmount } = strip([ASKED_4M, ASKED_12M]);
    expect(titles(container)).toEqual(["Add the invite links · petal", "Port the parser · katha"]);
    unmount();
  });

  it("opens the task it was clicked on", () => {
    const { container, onSelect, unmount } = strip([ASKED_4M]);
    click(find(container, "button"));
    expect(onSelect).toHaveBeenCalledWith("task1");
    unmount();
  });

  it("draws nothing at all while nothing waits", () => {
    const { container, unmount } = strip([]);
    expect(container.textContent).toBe("");
    unmount();
  });
});
