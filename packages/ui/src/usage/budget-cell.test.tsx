// @vitest-environment happy-dom
import type { BudgetReport } from "@agnostic/core";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { find, render } from "../test/render";
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
      day: { limitUsd: 5, spentUsd: 4.1, state: "ok" },
      week: { limitUsd: 20, spentUsd: 16.4, state: "ok" },
    });
    expect(container.textContent).toBe("budgettoday $4.10 of $5week $16.40 of $20");
    unmount();
  });

  it("draws the week line alone for a weekly-only ceiling, with no day line before it", () => {
    const { container, unmount } = cell({
      day: null,
      week: { limitUsd: 20, spentUsd: 18, state: "ok" },
    });
    expect(container.textContent).toContain("budget");
    expect(container.textContent).toContain("week $18 of $20");
    expect(container.textContent).not.toContain("today");
    unmount();
  });

  it("says a window is past the 80% line, in the warning colour", () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 4.1, state: "warn" },
      week: null,
    });
    const drawn = find(container, '[data-cell="budget"]');
    expect(drawn.getAttribute("data-tone")).toBe("warn");
    expect(container.textContent).toContain("Past your 80% budget");
    unmount();
  });

  it("says a spent window is over, not near", () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 5.2, state: "exceeded" },
      week: null,
    });
    const drawn = find(container, '[data-cell="budget"]');
    expect(drawn.getAttribute("data-tone")).toBe("exceeded");
    expect(container.textContent).toContain("Over budget");
    unmount();
  });

  it("says nothing about the ceiling while the spend is fine", () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 1, state: "ok" },
      week: null,
    });
    const drawn = find(container, '[data-cell="budget"]');
    expect(drawn.getAttribute("data-tone")).toBe("ok");
    expect(container.textContent).toBe("budgettoday $1 of $5");
    unmount();
  });

  it("names the percentage of each window's ceiling in the tooltip, at warn", async () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 4.1, state: "warn" },
      week: { limitUsd: 20, spentUsd: 18, state: "warn" },
    });
    await hover(find(container, '[data-cell="budget"]'));

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
    await hover(find(container, '[data-cell="budget"]'));

    expect(document.body.textContent).toContain("104% of the daily budget is spent.");
    expect(document.body.textContent).not.toContain("weekly budget");
    unmount();
  });

  it("warns right at 80% spent, with the warning tone", async () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 4, state: "warn" },
      week: null,
    });
    const drawn = find(container, '[data-cell="budget"]');

    expect(drawn.getAttribute("data-tone")).toBe("warn");
    expect(container.textContent).toContain("Past your 80% budget");
    await hover(drawn);
    expect(document.body.textContent).toContain("80% of the daily budget is spent.");
    unmount();
  });

  it("reads exceeded right at 100% spent, with the exceeded tone", async () => {
    const { container, unmount } = cell({
      day: { limitUsd: 5, spentUsd: 5, state: "exceeded" },
      week: null,
    });
    const drawn = find(container, '[data-cell="budget"]');

    expect(drawn.getAttribute("data-tone")).toBe("exceeded");
    expect(container.textContent).toContain("Over budget");
    await hover(drawn);
    expect(document.body.textContent).toContain("100% of the daily budget is spent.");
    unmount();
  });
});
