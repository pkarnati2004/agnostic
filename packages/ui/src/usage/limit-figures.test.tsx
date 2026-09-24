// @vitest-environment happy-dom
import type { PlanLimit } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../components/tooltip";
import { render } from "../test/render";
import { LimitFigures } from "./limit-figures";
import { PlanCell } from "./plan-cell";
import { claudeLimit, claudePlan, usageResponse } from "./usage-response.fixture";

const NOW = Date.parse(usageResponse().scannedAt);

function figures(limit: PlanLimit): { text: string; barWidth: string; unmount: () => void } {
  const { container, unmount } = render(<LimitFigures limit={limit} now={NOW} />);
  const bar = container.querySelector<HTMLElement>('[data-testid="five-hour-bar"]');
  return { text: container.textContent ?? "", barWidth: bar?.style.width ?? "", unmount };
}

const windows = { day: usageResponse().day.window, week: usageResponse().week.window };

function cell(limit: PlanLimit | null) {
  return render(
    <TooltipProvider>
      <PlanCell
        label="claude max20"
        vendor="claude"
        limit={limit}
        day={claudePlan()}
        week={claudePlan()}
        windows={windows}
        now={NOW}
      />
    </TooltipProvider>,
  );
}

describe("LimitFigures", () => {
  it("fills the bar to the five-hour percent and names both windows", () => {
    const drawn = figures(claudeLimit());

    expect(drawn.text).toContain("58% 5h · 41% wk");
    expect(drawn.barWidth).toBe("58%");
    drawn.unmount();
  });

  it("draws a dash for a window whose reset has already passed", () => {
    const stale = claudeLimit({ week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z" } });

    const drawn = figures(stale);

    expect(drawn.text).toContain("58% 5h · – wk");
    drawn.unmount();
  });

  // Core's `limitIsCurrent` cases (packages/core/src/usage.test.ts), against the page's own copy
  // of the rule: the page bundles no runtime code from `@agnostic/core`.
  it("keeps a window with no reset time for an hour after it was observed", () => {
    const window = { usedPercent: 12, resetsAt: null };
    const observedAt = new Date(NOW - 59 * 60_000).toISOString();

    const drawn = figures(claudeLimit({ fiveHour: window, week: null, observedAt }));

    expect(drawn.text).toContain("12% 5h");
    drawn.unmount();
  });

  it("drops a window with no reset time once the hour is up", () => {
    const window = { usedPercent: 12, resetsAt: null };
    const observedAt = new Date(NOW - 61 * 60_000).toISOString();

    const drawn = figures(claudeLimit({ fiveHour: window, week: null, observedAt }));

    expect(drawn.text).toContain("– 5h");
    drawn.unmount();
  });

  it("colours the bar once the window is nearly spent", () => {
    const hot = claudeLimit({
      fiveHour: { usedPercent: 96, resetsAt: new Date("2026-09-11T17:05:00").toISOString() },
    });
    const { container, unmount } = render(<LimitFigures limit={hot} now={NOW} />);

    const bar = container.querySelector<HTMLElement>('[data-testid="five-hour-bar"]');

    expect(bar?.style.backgroundColor).toBe("var(--destructive)");
    unmount();
  });
});

describe("PlanCell", () => {
  it("shows the percentages instead of the token figures when a window is current", () => {
    const { container, unmount } = cell(claudeLimit());

    expect(container.textContent).toContain("58% 5h");
    expect(container.textContent).not.toContain("1,234,567");
    unmount();
  });

  it("falls back to tokens and cost when every window is stale", () => {
    const stale = claudeLimit({
      fiveHour: { usedPercent: 58, resetsAt: "2026-09-10T09:00:00.000Z" },
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z" },
    });

    const { container, unmount } = cell(stale);

    expect(container.textContent).toContain("1,234,567");
    expect(container.textContent).not.toContain("5h");
    unmount();
  });

  it("falls back to tokens and cost when no file on this machine reports a limit", () => {
    const { container, unmount } = cell(null);

    expect(container.textContent).toContain("1,234,567");
    unmount();
  });

  it("marks the vendor the plan is billed to", () => {
    const { container, unmount } = cell(claudeLimit());

    expect(container.querySelector('[aria-label="claude"]')?.textContent).toBe("C");
    unmount();
  });
});
