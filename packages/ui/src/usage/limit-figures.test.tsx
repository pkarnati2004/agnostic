// @vitest-environment happy-dom
import type { PlanLimit } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { hasFigure, LimitFigures } from "./limit-figures";
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

/** A five-hour window at `usedPercent`, with a reset still ahead of the fixture's scan time. */
function fiveHourAt(usedPercent: number): Drawn {
  return figures(
    claudeLimit({
      fiveHour: {
        usedPercent,
        resetsAt: new Date("2026-09-11T17:05:00").toISOString(),
        freshness: "current",
      },
    }),
  );
}

/** `observedAt` as a number of minutes before the fixture's scan time. */
function observed(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("LimitFigures", () => {
  it("fills the bar to the five-hour percent and names both windows", () => {
    const drawn = figures(claudeLimit());

    expect(drawn.text).toBe("5h58%week41%");
    expect(drawn.bar.style.width).toBe("58%");
    expect(drawn.bar.style.backgroundColor).toBe("var(--muted-foreground)");
    expect(drawn.figure("five-hour").dataset.freshness).toBe("current");
    drawn.unmount();
  });

  it("marks a figure two hours old with a tilde, dimmed, and dims the bar with it", () => {
    const drawn = figures(claudeLimit({ observedAt: observed(3 * 60) }));

    expect(drawn.text).toBe("5h~58%week~41%");
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

    expect(drawn.text).toBe("5h58%week–");
    expect(drawn.figure("week").dataset.freshness).toBe("stale");
    drawn.unmount();
  });

  it("draws a dash for a stale five-hour window beside a week that is still live", () => {
    const drawn = figures(
      claudeLimit({
        fiveHour: { usedPercent: 58, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
      }),
    );

    expect(drawn.text).toBe("5h–week41%");
    drawn.unmount();
  });

  // Core's freshness cases (packages/core/src/usage.test.ts), through the import: the bar and
  // `agn usage` drop a stale window by the same rule.
  it("keeps a window with no reset time for an hour after it was observed", () => {
    const window = { usedPercent: 12, resetsAt: null, freshness: "current" } as const;

    const drawn = figures(claudeLimit({ fiveHour: window, week: null, observedAt: observed(59) }));

    expect(drawn.text).toContain("12%");
    drawn.unmount();
  });

  it("drops a window with no reset time once the hour is up", () => {
    const window = { usedPercent: 12, resetsAt: null, freshness: "stale" } as const;

    const drawn = figures(claudeLimit({ fiveHour: window, week: null, observedAt: observed(61) }));

    expect(drawn.text).toBe("5h–week–");
    drawn.unmount();
  });

  it("stays the plain colour one point under the warning line", () => {
    const drawn = fiveHourAt(79);

    expect(drawn.bar.style.backgroundColor).toBe("var(--muted-foreground)");
    drawn.unmount();
  });

  it("turns the warning colour right at the warning line", () => {
    const drawn = fiveHourAt(80);

    expect(drawn.bar.style.backgroundColor).toBe("var(--warning)");
    drawn.unmount();
  });

  it("stays the warning colour one point under the over line", () => {
    const drawn = fiveHourAt(94);

    expect(drawn.bar.style.backgroundColor).toBe("var(--warning)");
    drawn.unmount();
  });

  it("turns the destructive colour right at the over line", () => {
    const drawn = fiveHourAt(95);

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
