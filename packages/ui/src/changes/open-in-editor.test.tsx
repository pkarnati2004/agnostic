// @vitest-environment happy-dom
import type { EditorsResponse } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { click, render } from "../test/render";
import { OpenInEditor } from "./open-in-editor";

const ONE: EditorsResponse = {
  editors: [{ id: "vscode", name: "VS Code", via: "path", path: "/usr/bin/code" }],
  default: "vscode",
};

const TWO: EditorsResponse = {
  editors: [
    { id: "vscode", name: "VS Code", via: "path", path: "/usr/bin/code" },
    { id: "cursor", name: "Cursor", via: "app", path: "/Applications/Cursor.app" },
  ],
  default: "vscode",
};

const ZERO: EditorsResponse = { editors: [], default: null };

function panel(editors: EditorsResponse | null, disabled: boolean, onOpen = vi.fn()) {
  const rendered = render(
    <TooltipProvider delayDuration={0}>
      <OpenInEditor editors={editors} disabled={disabled} onOpen={onOpen} />
    </TooltipProvider>,
  );
  return { ...rendered, onOpen };
}

function button(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector("button");
  if (found === null) {
    throw new Error("no button rendered");
  }
  return found;
}

/** Opens a Radix tooltip: a real hover needs the pointer events its trigger listens for. */
async function hover(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" }),
    );
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe("OpenInEditor", () => {
  it("draws only the button for one editor, and opens the daemon's own pick", () => {
    const { container, onOpen, unmount } = panel(ONE, false);
    expect(button(container).textContent).toBe("Open in VS Code");
    expect(container.querySelector('[aria-label="Choose an editor"]')).toBeNull();
    click(button(container));
    expect(onOpen).toHaveBeenCalledWith(null);
    unmount();
  });

  it("adds a chevron for a second editor, and picking it opens that one", () => {
    const { container, onOpen, unmount } = panel(TWO, false);
    const trigger = container.querySelector<HTMLElement>('[aria-label="Choose an editor"]');
    if (trigger === null) {
      throw new Error("no chevron trigger for two editors");
    }
    act(() => trigger.click());
    const item = Array.from(document.querySelectorAll('[role="option"]')).find(
      (one) => one.textContent === "Cursor",
    );
    if (item === undefined) {
      throw new Error("Cursor is not offered");
    }
    act(() => (item as HTMLElement).click());
    expect(onOpen).toHaveBeenCalledWith("cursor");
    unmount();
  });

  it("disables the button with no editor and says to run agn doctor", async () => {
    const { container, unmount } = panel(ZERO, false);
    const trigger = button(container);
    expect(trigger.disabled).toBe(true);
    await hover(trigger.parentElement ?? trigger);
    expect(document.body.textContent).toContain("No editor found. Run `agn doctor`.");
    unmount();
  });

  it("waits for the editor list before it names one", () => {
    const { container, unmount } = panel(null, false);
    expect(button(container).textContent).toBe("Open in editor");
    expect(button(container).disabled).toBe(true);
    unmount();
  });

  it("disables the button while the panel is busy, even with an editor to open", () => {
    const { container, unmount } = panel(ONE, true);
    expect(button(container).disabled).toBe(true);
    unmount();
  });
});
