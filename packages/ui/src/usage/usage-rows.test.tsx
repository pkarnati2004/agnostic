// @vitest-environment happy-dom
import type { PlanLimit } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { claudeLimit, usageResponse } from "./usage-response.fixture";
import { UsageRows, usageRows } from "./usage-rows";

const NOW = Date.parse(usageResponse().scannedAt);

function rowsFor(limit: PlanLimit = claudeLimit()) {
  return usageRows(limit, NOW);
}

function drawn(limit: PlanLimit = claudeLimit()) {
  const { container, unmount } = render(<UsageRows rows={rowsFor(limit)} now={NOW} />);
  const row = (key: string): HTMLElement => {
    const found = container.querySelector<HTMLElement>(`[data-row="${key}"]`);
    if (found === null) {
      throw new Error(`no ${key} row drawn`);
    }
    return found;
  };
  return { container, row, unmount };
}

/** `observedAt` as a number of minutes before the fixture's scan time. */
function observed(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("usageRows", () => {
  it("names the windows by their length, the same way for every vendor", () => {
    expect(rowsFor().map((row) => [row.key, row.label])).toEqual([
      ["five-hour", "5-hour window"],
      ["week", "This week"],
    ]);
  });

  it("leaves out a window the harness never reported", () => {
    expect(rowsFor(claudeLimit({ fiveHour: null })).map((row) => row.key)).toEqual(["week"]);
  });

  it("keeps a stale window's row and drops its figure and its reset", () => {
    const stale = claudeLimit({
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
    });

    expect(rowsFor(stale)[1]).toMatchObject({
      key: "week",
      percent: null,
      resetsAt: null,
      freshness: "stale",
    });
  });

  it("says nothing about Fable: the payload carries no Fable window (ADR 029, 2026-09-30)", () => {
    expect(rowsFor().map((row) => row.key)).not.toContain("fable");
  });
});

describe("UsageRows", () => {
  it("draws the label, the reset and the percent used", () => {
    const panel = drawn();

    expect(panel.row("five-hour").textContent).toBe("5-hour windowResets at 17:0558% used");
    panel.unmount();
  });

  it("leaves the reset line out of a window that reported none", () => {
    const noReset = claudeLimit({
      week: { usedPercent: 41, resetsAt: null, freshness: "current" },
      observedAt: observed(5),
    });

    const panel = drawn(noReset);

    expect(panel.row("week").textContent).toBe("This week41% used");
    panel.unmount();
  });

  it("marks an approximate row with a tilde and draws it at full strength", () => {
    const panel = drawn(claudeLimit({ observedAt: observed(3 * 60) }));

    expect(panel.row("five-hour").textContent).toContain("~58% used");
    expect(panel.row("five-hour").dataset.freshness).toBe("approximate");
    expect(panel.row("five-hour").className).not.toContain("text-primary-foreground-muted");
    panel.unmount();
  });

  it("draws every row at full strength, whatever its freshness", () => {
    const panel = drawn(
      claudeLimit({
        week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
        observedAt: observed(3 * 60),
      }),
    );

    for (const key of ["five-hour", "week"]) {
      expect(panel.row(key).className).toBe("flex items-center gap-3");
    }
    panel.unmount();
  });

  it("draws a dash and an empty bar for a stale row", () => {
    const stale = claudeLimit({
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
    });

    const panel = drawn(stale);
    const bar = panel.row("week").querySelector<HTMLElement>('[data-testid="week-row-bar"]');

    expect(panel.row("week").textContent).toBe("This week–");
    expect(bar?.style.width).toBe("0%");
    panel.unmount();
  });

  it("draws a track of its own width behind every row's fill", () => {
    const panel = drawn();

    for (const key of ["five-hour", "week"]) {
      const track = panel.row(key).querySelector<HTMLElement>(`[data-testid="${key}-row-track"]`);

      expect(track?.style.width).toBe("72px");
      expect(track?.className).toContain("bg-primary-foreground-muted");
      expect(track?.querySelector(`[data-testid="${key}-row-bar"]`)).not.toBeNull();
    }
    panel.unmount();
  });

  it("colours the bar by how much of the window is spent", () => {
    for (const [percent, colour] of [
      [38, "var(--primary-foreground)"],
      [84, "var(--warning)"],
      [96, "var(--destructive)"],
    ] as const) {
      const limit = claudeLimit({
        fiveHour: {
          usedPercent: percent,
          resetsAt: new Date("2026-09-11T17:05:00").toISOString(),
          freshness: "current",
        },
      });
      const panel = drawn(limit);
      const bar = panel
        .row("five-hour")
        .querySelector<HTMLElement>('[data-testid="five-hour-row-bar"]');

      expect(bar?.style.backgroundColor).toBe(colour);
      panel.unmount();
    }
  });
});
