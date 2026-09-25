// @vitest-environment happy-dom
import type { Task, TaskStatus } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { click, find, render } from "../test/render";
import { type TabItem, TabStrip } from "./tab-strip";

function task(id: string, title: string, status: TaskStatus = "running"): Task {
  return {
    id,
    repoId: "r1",
    title,
    prompt: title,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: null,
    branch: null,
    status,
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
  };
}

function tab(id: string, title: string, status: TaskStatus = "running"): TabItem {
  return { kind: "task", id, task: task(id, title, status) };
}

const REPOS = new Map([["r1", "petal"]]);

function strip(props: Partial<Parameters<typeof TabStrip>[0]> = {}) {
  const handlers = { onActivate: vi.fn(), onClose: vi.fn(), onNewTask: vi.fn() };
  const rendered = render(
    <TooltipProvider>
      <TabStrip
        tabs={[tab("a", "Add the retry budget"), tab("b", "Port the parser to zod")]}
        activeId="b"
        repoNames={REPOS}
        {...handlers}
        {...props}
      />
    </TooltipProvider>,
  );
  return { ...rendered, ...handlers };
}

function tabAt(container: HTMLElement, index: number): HTMLElement {
  const tabs = container.querySelectorAll<HTMLElement>("[data-tab]");
  const found = tabs[index];
  if (found === undefined) {
    throw new Error(`the strip drew ${tabs.length} tabs, not ${index + 1}`);
  }
  return found;
}

describe("TabStrip", () => {
  it("renders one tab per open task", () => {
    const { container, unmount } = strip();
    expect(container.textContent).toContain("Add the retry budget");
    expect(container.querySelectorAll("[data-tab]")).toHaveLength(2);
    unmount();
  });

  it("puts the close button on the tab in front and on no other", () => {
    const { container, unmount } = strip();
    const closes = container.querySelectorAll("[aria-label^='Close']");
    expect(closes).toHaveLength(1);
    expect(closes[0]?.getAttribute("aria-label")).toBe("Close Port the parser to zod");
    unmount();
  });

  it("marks the tab in front with the ring edge and leaves the rest muted", () => {
    const { container, unmount } = strip();
    expect(tabAt(container, 0).className).toContain("text-muted-foreground");
    expect(tabAt(container, 1).className).toContain("--ring");
    expect(tabAt(container, 1).getAttribute("data-active")).toBe("true");
    unmount();
  });

  it("keeps the waiting edge on a waiting tab that is not in front", () => {
    const { container, unmount } = strip({
      tabs: [tab("a", "Add the retry budget", "waiting"), tab("b", "Port the parser to zod")],
    });
    expect(tabAt(container, 0).className).toContain("--status-waiting");
    expect(tabAt(container, 0).getAttribute("data-status")).toBe("waiting");
    unmount();
  });

  it("leaves a long title to the CSS and keeps the whole one in the tooltip", () => {
    const { container, unmount } = strip({
      tabs: [tab("a", "Rename every configuration key in the repo")],
      activeId: "a",
    });
    expect(container.textContent).toContain("Rename every configuration key in the repo");
    expect(find(container, "span.truncate")).toBeDefined();
    unmount();
  });

  it("draws a compare tab with its icon and its count", () => {
    const { container, unmount } = strip({
      tabs: [
        tab("a", "Add the retry budget"),
        { kind: "compare", id: "compare:c1", title: "Try two parsers", agents: 2 },
      ],
      activeId: "compare:c1",
    });
    expect(tabAt(container, 1).querySelector("svg")).not.toBeNull();
    expect(tabAt(container, 1).textContent).toBe("Try two parsers2");
    unmount();
  });

  it("carries the id to both callbacks", () => {
    const { container, onActivate, onClose, unmount } = strip();
    click(find(tabAt(container, 0), "button"));
    click(find(container, "[aria-label='Close Port the parser to zod']"));
    expect(onActivate).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalledWith("b");
    unmount();
  });

  it("offers the + with no tab open at all", () => {
    const { container, onNewTask, unmount } = strip({ tabs: [], activeId: null });
    expect(container.querySelectorAll("[data-tab]")).toHaveLength(0);
    click(find(container, "[aria-label='New task']"));
    expect(onNewTask).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("puts the + after every tab, as a real button the keyboard can reach", () => {
    const { container, unmount } = strip();
    const tablist = find(container, "[role='tablist']");
    const last = tablist.lastElementChild as HTMLButtonElement;
    expect(last.getAttribute("aria-label")).toBe("New task");
    expect(last.tagName).toBe("BUTTON");
    expect(last.tabIndex).not.toBe(-1);
    last.focus();
    expect(document.activeElement).toBe(last);
    unmount();
  });
});
