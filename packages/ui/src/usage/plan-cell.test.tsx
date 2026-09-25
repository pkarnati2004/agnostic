// @vitest-environment happy-dom
import type { PlanLimit } from "@agnostic/core";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { find, render } from "../test/render";
import { PlanCell, type PlanCellQuestion } from "./plan-cell";
import { claudeLimit, claudePlan, planOptions, usageResponse } from "./usage-response.fixture";

const NOW = Date.parse(usageResponse().scannedAt);

const QUESTION: PlanCellQuestion = {
  options: planOptions(),
  busy: false,
  error: null,
  onPick: vi.fn(),
};

/** The cell itself, without its tooltip: which of the three states it draws. */
function cell(
  over: { limit?: PlanLimit | null; plan?: string | null; question?: PlanCellQuestion | null } = {},
) {
  return render(
    <TooltipProvider>
      <PlanCell
        label="Claude max20"
        vendor="claude"
        plan={over.plan === undefined ? "max20" : over.plan}
        limit={over.limit ?? null}
        day={claudePlan()}
        week={claudePlan()}
        now={NOW}
        question={over.question ?? null}
      />
    </TooltipProvider>,
  );
}

function state(container: HTMLElement): string | null {
  return find(container, '[data-cell="plan"]').getAttribute("data-state");
}

/** Every window of a limit whose resets are all behind the fixture's scan time. */
const ALL_STALE = claudeLimit({
  fiveHour: { usedPercent: 58, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
  week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
});

describe("PlanCell", () => {
  it("shows the percentages instead of the token figures when a window is current", () => {
    const { container, unmount } = cell({ limit: claudeLimit() });

    expect(state(container)).toBe("percent");
    expect(container.textContent).toContain("58%");
    expect(container.textContent).not.toContain("tok");
    unmount();
  });

  it("falls back to tokens when every window is stale", () => {
    const { container, unmount } = cell({ limit: ALL_STALE });

    expect(state(container)).toBe("tokens");
    expect(container.textContent).toContain("1.2M tok");
    unmount();
  });

  it("falls back to tokens when no file on this machine reports a limit", () => {
    const { container, unmount } = cell();

    expect(state(container)).toBe("tokens");
    expect(container.textContent).toContain("1.2M tok");
    unmount();
  });

  it("asks which plan it is instead of naming one it does not know", () => {
    const { container, unmount } = cell({ plan: null, question: QUESTION });

    expect(state(container)).toBe("unknown");
    expect(container.textContent).toContain("Which Claude plan are you on?");
    expect(container.textContent).not.toContain("Claude max20");
    unmount();
  });

  it("says why the last answer did not stick, in the cell it was given in", () => {
    const { container, unmount } = cell({
      plan: null,
      question: { ...QUESTION, error: "no catalog row for max50" },
    });

    expect(container.textContent).toContain("no catalog row for max50");
    unmount();
  });

  it("keeps the chips up after a failed write, so the user can try another one", () => {
    const { container, unmount } = cell({
      plan: null,
      question: { ...QUESTION, error: "no catalog row for max50" },
    });

    expect(container.querySelectorAll("button").length).toBe(4);
    unmount();
  });

  it("marks the harness the plan is billed through", () => {
    const { container, unmount } = cell({ limit: claudeLimit() });

    expect(container.querySelector('[aria-label="claude-code"]')?.textContent).toBe("C");
    expect(find(container, '[data-cell="plan"]').getAttribute("data-vendor")).toBe("claude");
    unmount();
  });
});
