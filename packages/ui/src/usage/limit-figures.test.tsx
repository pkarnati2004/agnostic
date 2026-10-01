// @vitest-environment happy-dom
import type { PlanLimit } from "@agnostic/core";
import { limitFreshness } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { hasFigure, LimitFigures, windowFreshness } from "./limit-figures";
import { claudeLimit, usageResponse } from "./usage-response.fixture";

const NOW = Date.parse(usageResponse().scannedAt);

type Drawn = {
  text: string;
  bar: HTMLElement;
  figure(window: "five-hour" | "week"): HTMLElement;
  unmount(): void;
};

function figures(limit: PlanLimit): Drawn {
  const { container, unmount } = render(<LimitFigures limit={limit} now={NOW} />);
  const find = (selector: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(selector);
    if (found === null) {
      throw new Error(`nothing rendered for "${selector}"`);
    }
    return found;
  };
  return {
    text: container.textContent ?? "",
    bar: find('[data-testid="five-hour-bar"]'),
    figure: (window) => find(`[data-window="${window}"]`),
    unmount,
  };
}

/** `observedAt` as a number of minutes before the fixture's scan time. */
function observed(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("LimitFigures", () => {
  it("fills the bar to the five-hour percent and names both windows", () => {
    const drawn = figures(claudeLimit());

    expect(drawn.text).toContain("58% 5h · 41% wk");
    expect(drawn.bar.style.width).toBe("58%");
    expect(drawn.figure("five-hour").dataset.freshness).toBe("current");
    drawn.unmount();
  });

  it("marks a figure two hours old with a tilde, dimmed, and dims the bar with it", () => {
    const drawn = figures(claudeLimit({ observedAt: observed(3 * 60) }));

    expect(drawn.text).toContain("~58% 5h · ~41% wk");
    expect(drawn.figure("week").dataset.freshness).toBe("approximate");
    expect(drawn.figure("week").className).toContain("text-muted-foreground");
    expect(drawn.bar.style.opacity).toBe("0.5");
    drawn.unmount();
  });

  it("draws a dash for a window whose reset has already passed", () => {
    const stale = claudeLimit({
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
    });

    const drawn = figures(stale);

    expect(drawn.text).toContain("58% 5h · – wk");
    expect(drawn.figure("week").dataset.freshness).toBe("stale");
    drawn.unmount();
  });

  it("colours the bar once the window is nearly spent", () => {
    const hot = claudeLimit({
      fiveHour: {
        usedPercent: 96,
        resetsAt: new Date("2026-09-11T17:05:00").toISOString(),
        freshness: "current",
      },
    });

    const drawn = figures(hot);

    expect(drawn.bar.style.backgroundColor).toBe("var(--destructive)");
    drawn.unmount();
  });

  it("says nothing about Fable: the payload carries no Fable window (ADR 029, 2026-09-30)", () => {
    const drawn = figures(claudeLimit());

    expect(drawn.text.toLowerCase()).not.toContain("fable");
    drawn.unmount();
  });
});

describe("hasFigure", () => {
  it("holds while any window is not stale", () => {
    expect(hasFigure(claudeLimit({ fiveHour: null }), NOW)).toBe(true);
  });

  it("drops a limit whose every window is past its reset", () => {
    const stale = claudeLimit({
      fiveHour: { usedPercent: 58, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
    });

    expect(hasFigure(stale, NOW)).toBe(false);
  });
});

// Core's own cases (packages/core/src/usage.test.ts), against the page's copy of the rule: the
// page bundles no runtime code from `@agnostic/core`.
describe("windowFreshness", () => {
  const ahead = { usedPercent: 58, resetsAt: new Date(NOW + 3_600_000).toISOString() };
  const noReset = { usedPercent: 41, resetsAt: null };

  const cases: [string, { usedPercent: number; resetsAt: string | null }, string][] = [
    ["a reset ahead and 119 min", ahead, observed(119)],
    ["a reset ahead and 120 min", ahead, observed(120)],
    ["a reset at now", { usedPercent: 58, resetsAt: new Date(NOW).toISOString() }, observed(10)],
    ["no reset and 59 min", noReset, observed(59)],
    ["no reset and 60 min", noReset, observed(60)],
    ["an observation time it cannot read", ahead, "not a time"],
  ];

  for (const [name, window, observedAt] of cases) {
    it(`agrees with core on ${name}`, () => {
      expect(windowFreshness(window, observedAt, NOW)).toBe(
        limitFreshness(window, observedAt, new Date(NOW)),
      );
    });
  }

  it("has no figure at all for a window the harness never reported", () => {
    expect(windowFreshness(null, observed(1), NOW)).toBe("stale");
  });
});
