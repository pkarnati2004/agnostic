// @vitest-environment happy-dom
import type { PlanLimit, PlanVendor } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { render } from "../test/render";
import { claudeLimit, usageResponse } from "./usage-response.fixture";
import { UsageRows, usageRows } from "./usage-rows";

const NOW = Date.parse(usageResponse().scannedAt);

function rowsFor(vendor: PlanVendor | null, limit: PlanLimit = claudeLimit()) {
  return usageRows(vendor, limit, NOW);
}

function drawn(vendor: PlanVendor | null, limit: PlanLimit = claudeLimit()) {
  const { container, unmount } = render(<UsageRows rows={rowsFor(vendor, limit)} now={NOW} />);
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
  it("names the windows the way Claude Code does", () => {
    expect(rowsFor("claude").map((row) => [row.key, row.label])).toEqual([
      ["five-hour", "Current session"],
      ["week", "This week"],
    ]);
  });

  it("names them by their length for every other vendor", () => {
    expect(rowsFor("chatgpt").map((row) => [row.key, row.label])).toEqual([
      ["five-hour", "5-hour window"],
      ["week", "This week"],
    ]);
  });

  it("leaves out a window the harness never reported", () => {
    expect(rowsFor("claude", claudeLimit({ fiveHour: null })).map((row) => row.key)).toEqual([
      "week",
    ]);
  });

  it("keeps a stale window's row and drops its figure and its reset", () => {
    const stale = claudeLimit({
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
    });

    expect(rowsFor("claude", stale)[1]).toMatchObject({
      key: "week",
      percent: null,
      resetsAt: null,
      freshness: "stale",
    });
  });

  it("says nothing about Fable: the payload carries no Fable window (ADR 029, 2026-09-30)", () => {
    expect(rowsFor("claude").map((row) => row.key)).not.toContain("fable");
  });
});

describe("UsageRows", () => {
  it("draws the label, the reset and the percent used", () => {
    const panel = drawn("claude");

    expect(panel.row("five-hour").textContent).toBe("Current sessionResets at 17:0558% used");
    panel.unmount();
  });

  it("leaves the reset line out of a window that reported none", () => {
    const noReset = claudeLimit({
      week: { usedPercent: 41, resetsAt: null, freshness: "current" },
      observedAt: observed(5),
    });

    const panel = drawn("claude", noReset);

    expect(panel.row("week").textContent).toBe("This week41% used");
    panel.unmount();
  });

  it("marks an approximate row with a tilde and dims it", () => {
    const panel = drawn("claude", claudeLimit({ observedAt: observed(3 * 60) }));

    expect(panel.row("five-hour").textContent).toContain("~58% used");
    expect(panel.row("five-hour").dataset.freshness).toBe("approximate");
    expect(panel.row("five-hour").className).toContain("text-primary-foreground-muted");
    panel.unmount();
  });

  it("draws a dash and an empty bar for a stale row", () => {
    const stale = claudeLimit({
      week: { usedPercent: 41, resetsAt: "2026-09-10T09:00:00.000Z", freshness: "stale" },
    });

    const panel = drawn("claude", stale);
    const bar = panel.row("week").querySelector<HTMLElement>('[data-testid="week-row-bar"]');

    expect(panel.row("week").textContent).toBe("This week–");
    expect(bar?.style.width).toBe("0%");
    panel.unmount();
  });

  it("colours the bar by how much of the window is spent", () => {
    for (const [percent, colour] of [
      [38, "var(--foreground)"],
      [84, "var(--status-waiting)"],
      [96, "var(--destructive)"],
    ] as const) {
      const limit = claudeLimit({
        fiveHour: {
          usedPercent: percent,
          resetsAt: new Date("2026-09-11T17:05:00").toISOString(),
          freshness: "current",
        },
      });
      const panel = drawn("claude", limit);
      const bar = panel
        .row("five-hour")
        .querySelector<HTMLElement>('[data-testid="five-hour-row-bar"]');

      expect(bar?.style.backgroundColor).toBe(colour);
      panel.unmount();
    }
  });
});
