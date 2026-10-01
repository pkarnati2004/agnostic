// @vitest-environment happy-dom
import { act } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { find, render } from "../test/render";
import { UnavailableCell } from "./unavailable-cell";

function cell(harnesses: string[]) {
  return render(
    <TooltipProvider delayDuration={0}>
      <UnavailableCell harnesses={harnesses} />
    </TooltipProvider>,
  );
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

describe("UnavailableCell", () => {
  it("draws nothing when every agent on the machine records its usage", () => {
    const { container, unmount } = cell([]);

    expect(container.querySelector('[data-cell="unavailable"]')).toBeNull();
    unmount();
  });

  it("names each agent by the name the registry gives it", () => {
    const { container, unmount } = cell(["kimi", "droid"]);

    expect(find(container, '[data-cell="unavailable"]').textContent).toBe(
      "no usage: Kimi CLI, Factory Droid",
    );
    unmount();
  });

  it("says why, one line per agent, in the tooltip", async () => {
    const { container, unmount } = cell(["kimi"]);

    await hover(find(container, '[data-cell="unavailable"]'));

    const content = document.body.querySelector('[data-slot="tooltip-content"]');
    expect(content?.textContent).toBe(
      "Usage is not available for Kimi CLI: nothing on this machine records it.",
    );
    unmount();
  });
});
