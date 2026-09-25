// @vitest-environment happy-dom
import type { CompareTaskRow } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { click, find, render } from "../test/render";
import { CompareColumn } from "./compare-column";
import { compareRow, outcome } from "./compare-fixture";

const NOW = Date.parse("2026-09-20T10:04:03.000Z");

function column(row: CompareTaskRow, picked: "kept" | "removed" | null = null, busy = false) {
  const on = { onOpen: vi.fn(), onPick: vi.fn() };
  return {
    ...on,
    ...render(<CompareColumn row={row} picked={picked} busy={busy} now={NOW} {...on} />),
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (one) => one.textContent === label,
  );
  if (found === undefined) {
    throw new Error(`no "${label}" button`);
  }
  return found;
}

describe("CompareColumn", () => {
  it("says what the agent is, did and cost", () => {
    const { container, unmount } = column(
      compareRow({ status: "done", outcome: outcome({ testsAfter: true }) }),
    );
    expect(container.textContent).toContain("claude-code · sonnet-4.5");
    expect(container.textContent).toContain("Done");
    expect(container.textContent).toContain("+42");
    expect(container.textContent).toContain("−7");
    expect(container.textContent).toContain("pass");
    unmount();
  });

  it("marks the sibling a pick kept and offers no second pick for it", () => {
    const { container, unmount } = column(compareRow(), "kept");
    expect(find(container, "section").getAttribute("data-picked")).toBe("kept");
    expect(button(container, "Picked").disabled).toBe(true);
    expect(container.querySelector("button[disabled]")).not.toBeNull();
    unmount();
  });

  it("shows the Picked control once: the footer never offers Pick beside it", () => {
    const { container, unmount } = column(compareRow(), "kept");
    const buttons = Array.from(container.querySelectorAll("button")).map((one) => one.textContent);
    expect(buttons.filter((label) => label === "Picked")).toHaveLength(1);
    expect(buttons).not.toContain("Pick");
    unmount();
  });

  it("says what became of a sibling the pick cleaned", () => {
    const { container, unmount } = column(compareRow(), "removed");
    expect(container.textContent).toContain("removed · branch kept");
    expect(find(container, "section").getAttribute("data-picked")).toBe("removed");
    unmount();
  });

  it("opens the sibling's tab and asks for the pick", () => {
    const { container, onOpen, onPick, unmount } = column(compareRow());
    click(button(container, "Open"));
    click(button(container, "Pick"));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onPick).toHaveBeenCalledOnce();
    unmount();
  });

  it("says nothing was counted when git declined to count", () => {
    const { container, unmount } = column(compareRow({ changes: null }));
    expect(container.textContent).not.toContain("+42");
    unmount();
  });
});
