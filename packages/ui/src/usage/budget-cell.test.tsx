// @vitest-environment happy-dom
import type { BudgetReport } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { render } from "../test/render";
import { BudgetCell } from "./budget-cell";

function cell(budget: BudgetReport) {
  return render(
    <TooltipProvider delayDuration={0}>
      <BudgetCell budget={budget} />
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

describe("BudgetCell", () => {
  it("draws nothing when config.yaml sets no ceiling", () => {
    const { container, unmount } = cell({ day: null, week: null });
    expect(container.textContent).toBe("");
    unmount();
  });

  it("draws both windows, the day first", () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 4.1, state: "warn" },
      week: { limitUsd: 20, spentUsd: 18, state: "warn" },
    });
    expect(container.textContent).toContain("budget");
    expect(container.textContent).toContain("$4.10 / $5.00 today");
    expect(container.textContent).toContain("$18 / $20 wk");
    unmount();
  });

  it("draws the week line alone for a weekly-only ceiling, with no day line before it", () => {
    const { container, unmount } = cell({
      day: null,
      week: { limitUsd: 20, spentUsd: 18, state: "warn" },
    });
    expect(container.textContent).toContain("budget");
    expect(container.textContent).toContain("$18 / $20 wk");
    expect(container.textContent).not.toContain("today");
    unmount();
  });

  it("colours a window near its ceiling with the waiting token", () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 4.1, state: "warn" },
      week: null,
    });
    const drawn = container.querySelector("div");
    expect(drawn?.getAttribute("style")).toContain("--warning");
    expect(drawn?.className).not.toContain("text-destructive");
    unmount();
  });

  it("marks a spent window as a failure rather than a warning", () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" },
      week: null,
    });
    expect(container.querySelector("div")?.className).toContain("text-destructive");
    unmount();
  });

  it("names the percentage of each window's ceiling in the tooltip, at warn", async () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 4.1, state: "warn" },
      week: { limitUsd: 20, spentUsd: 18, state: "warn" },
    });
    await hover(container.querySelector("div") as Element);

    expect(document.body.textContent).toContain("82% of the daily budget is spent.");
    expect(document.body.textContent).toContain("90% of the weekly budget is spent.");
    expect(document.body.textContent).toContain(
      "api-key and credits runs are refused at 100%; subscription runs are never counted.",
    );
    unmount();
  });

  it("names the percentage past 100 in the tooltip, at exceeded, and drops a window with no ceiling", async () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" },
      week: null,
    });
    await hover(container.querySelector("div") as Element);

    expect(document.body.textContent).toContain("104% of the daily budget is spent.");
    expect(document.body.textContent).not.toContain("weekly budget");
    unmount();
  });
});
