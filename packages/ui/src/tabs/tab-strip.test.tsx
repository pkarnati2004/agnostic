// @vitest-environment happy-dom
import type { Task } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { type TabItem, TabStrip } from "./tab-strip";

function task(id: string, title: string): Task {
  return {
    id,
    repoId: "r1",
    title,
    prompt: title,
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: null,
    branch: null,
    status: "running",
    origin: "agn",
    baseCommit: null,
    compareId: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
  };
}

function tab(id: string, title: string): TabItem {
  return { kind: "task", id, task: task(id, title) };
}

const REPOS = new Map([["r1", "petal"]]);

function strip(onActivate = vi.fn(), onClose = vi.fn()) {
  const tabs = [tab("a", "Add the retry budget"), tab("b", "Port the parser to zod")];
  const rendered = render(
    <TooltipProvider>
      <TabStrip
        tabs={tabs}
        activeId="b"
        repoNames={REPOS}
        onActivate={onActivate}
        onClose={onClose}
      />
    </TooltipProvider>,
  );
  return { ...rendered, onActivate, onClose };
}

describe("TabStrip", () => {
  it("renders one tab per open task", () => {
    const { container, unmount } = strip();
    expect(container.textContent).toContain("Add the retry budget");
    expect(container.querySelectorAll("[aria-label^='Close']")).toHaveLength(2);
    unmount();
  });

  it("marks only the active tab, leaving the rest muted", () => {
    const { container, unmount } = strip();
    const inactive = container.querySelector(
      "[aria-label='Close Add the retry budget']",
    )?.parentElement;
    const active = container.querySelector(
      "[aria-label='Close Port the parser to zod']",
    )?.parentElement;
    expect(inactive?.className).toContain("text-muted-foreground");
    expect(inactive?.className).not.toContain("bg-card");
    expect(active?.className).toContain("bg-card");
    expect(active?.className).not.toContain("text-muted-foreground");
    unmount();
  });

  it("truncates a long title", () => {
    const { container, unmount } = render(
      <TooltipProvider>
        <TabStrip
          tabs={[tab("a", "Rename every configuration key in the repo")]}
          activeId="a"
          repoNames={REPOS}
          onActivate={vi.fn()}
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(container.textContent).toContain("Rename every configurat…");
    unmount();
  });

  it("draws a compare tab with its icon and the count in the tooltip", () => {
    const onActivate = vi.fn();
    const { container, unmount } = render(
      <TooltipProvider>
        <TabStrip
          tabs={[
            tab("a", "Add the retry budget"),
            { kind: "compare", id: "compare:c1", title: "Try two parsers", agents: 2 },
          ]}
          activeId="compare:c1"
          repoNames={REPOS}
          onActivate={onActivate}
          onClose={vi.fn()}
        />
      </TooltipProvider>,
    );
    const compare = container.querySelector("[aria-label='Close Try two parsers']");
    expect(container.querySelectorAll("[aria-label^='Close']")).toHaveLength(2);
    expect(compare?.parentElement?.querySelector("svg.lucide-git-compare")).not.toBeNull();
    expect(container.textContent).toContain("Try two parsers");
    unmount();
  });

  it("carries the id to both callbacks", () => {
    const { container, onActivate, onClose, unmount } = strip();
    const buttons = container.querySelectorAll("button");
    const activate = buttons[0];
    const close = container.querySelector("[aria-label='Close Add the retry budget']");
    if (activate === undefined || close === null) {
      throw new Error("the strip rendered no tab");
    }
    click(activate);
    click(close);
    expect(onActivate).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalledWith("a");
    unmount();
  });
});
