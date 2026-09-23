// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "../components/dialog";
import { click, render } from "../test/render";
import { compareRow } from "./compare-fixture";
import { PickDialog } from "./pick-dialog";

/** Radix portals the dialog to `document.body`, outside the render helper's own container. */
function dialog(): HTMLElement {
  const content = document.querySelector<HTMLElement>("[data-slot='dialog-content']");
  if (content === null) {
    throw new Error("no dialog is open");
  }
  return content;
}

function button(label: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll("button")].find(
    (one) => one.textContent?.trim() === label,
  );
  if (found === undefined) {
    throw new Error(`no button reads "${label}"`);
  }
  return found;
}

function open(others: number, onConfirm: () => Promise<void> = vi.fn(() => Promise.resolve())) {
  const rendered = render(
    <Dialog open>
      <DialogContent>
        <PickDialog row={compareRow()} others={others} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>,
  );
  return { ...rendered, onConfirm };
}

describe("PickDialog", () => {
  it("names the profile the pick would keep", () => {
    const { unmount } = open(1);
    expect(dialog().textContent).toContain("Keep claude-code:sonnet-4.5:native?");
    unmount();
  });

  it("reads as one agent, singular, when there is one other sibling", () => {
    const { unmount } = open(1);
    expect(dialog().textContent).toContain(
      "The other 1 agent is stopped and its worktree removed. Its branch stays, so nothing committed is lost.",
    );
    unmount();
  });

  it("reads as several agents, plural, when there is more than one other sibling", () => {
    const { unmount } = open(3);
    expect(dialog().textContent).toContain(
      "The other 3 agents are stopped and their worktrees removed. Their branches stay, so nothing committed is lost.",
    );
    unmount();
  });

  it("offers Cancel beside Pick", () => {
    const { unmount } = open(1);
    expect(button("Cancel")).toBeDefined();
    expect(button("Pick")).toBeDefined();
    unmount();
  });

  it("confirms once and keeps Pick and Cancel disabled until the call settles", async () => {
    let settle: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const { unmount } = open(1, onConfirm);
    click(button("Pick"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(button("Pick").disabled).toBe(true);
    expect(button("Cancel").disabled).toBe(true);
    await act(async () => settle());
    expect(button("Pick").disabled).toBe(false);
    expect(button("Cancel").disabled).toBe(false);
    unmount();
  });
});
