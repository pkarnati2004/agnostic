// @vitest-environment happy-dom
import type { RepoListRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { find, render } from "../test/render";
import type { RepoGroup } from "./group-tasks";
import { RepoSection } from "./repo-section";

const REPO: RepoListRow = {
  id: "r1",
  path: "/Users/dev/petal",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-01T00:00:00.000Z",
  status: "active",
  testCommand: null,
  // Remove sits on the heading only while the folder is gone, so this is what puts it there.
  pathPresent: false,
};

const GROUP: RepoGroup = { repo: REPO, rows: [], history: [] };

function section() {
  return render(
    <TooltipProvider>
      <RepoSection
        group={GROUP}
        selectedId={null}
        expanded={false}
        notice={null}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
        onClose={() => Promise.resolve()}
        onRemove={vi.fn()}
        openCompares={new Map()}
        onToggleCompare={vi.fn()}
        onOpenCompare={vi.fn()}
      />
    </TooltipProvider>,
  );
}

/** Picks 3 above: the heading's icons hide behind opacity until hover or focus, but a keyboard user
 * never hovers, so they must reach the buttons by Tab whether or not the pointer has been near them. */
describe("RepoSection heading", () => {
  it("keeps Close and Remove in the DOM and reachable by keyboard when the pointer is elsewhere", () => {
    const { container, unmount } = section();
    const close = find<HTMLButtonElement>(container, "[aria-label='Close petal']");
    const remove = find<HTMLButtonElement>(container, "[aria-label='Remove petal']");

    // Hidden with opacity, not display or visibility, and never disabled: all three would remove a
    // button from the tab order or its accessible name, and none of them apply here.
    for (const button of [close, remove]) {
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.tabIndex).not.toBe(-1);
    }

    close.focus();
    expect(document.activeElement).toBe(close);
    remove.focus();
    expect(document.activeElement).toBe(remove);
    unmount();
  });

  it("drops Remove once the repo's folder is back, keeping Close alone", () => {
    const present: RepoGroup = { ...GROUP, repo: { ...REPO, pathPresent: true } };
    const { container, unmount } = render(
      <TooltipProvider>
        <RepoSection
          group={present}
          selectedId={null}
          expanded={false}
          notice={null}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
          onClose={() => Promise.resolve()}
          onRemove={vi.fn()}
          openCompares={new Map()}
          onToggleCompare={vi.fn()}
          onOpenCompare={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(container.querySelector("[aria-label='Remove petal']")).toBeNull();
    expect(container.querySelector("[aria-label='Close petal']")).not.toBeNull();
    unmount();
  });
});
