import type { LimitWindow, PlanLimit } from "@agnostic/core";
import { formatPercent } from "./format-usage";

/** Where the 5-hour bar stops being a figure and starts being a warning. */
const WARN_PERCENT = 80;
const OVER_PERCENT = 95;

const BAR_WIDTH_PX = 48;
const BAR_HEIGHT_PX = 6;

/** A window agn has no current figure for: an en dash, not a zero the user would read as spent. */
const STALE = "–";

/**
 * What the plan's own meter says: a bar for the 5-hour window, which is the one that moves within
 * a sitting, and the week beside it as text. The caller draws this only when a window is current.
 */
export function LimitFigures({ limit, now }: { limit: PlanLimit; now: number }) {
  const fiveHour = current(limit.fiveHour, limit.observedAt, now);
  const week = current(limit.week, limit.observedAt, now);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span
        className="shrink-0 overflow-hidden rounded-full bg-border"
        style={{ width: BAR_WIDTH_PX, height: BAR_HEIGHT_PX }}
      >
        <span
          className="block h-full rounded-full"
          data-testid="five-hour-bar"
          style={{
            width: `${fiveHour === null ? 0 : Math.min(100, Math.max(0, fiveHour.usedPercent))}%`,
            backgroundColor: fill(fiveHour),
          }}
        />
      </span>
      <span className="tabular-nums text-foreground">
        {figure(fiveHour)} 5h · {figure(week)} wk
      </span>
    </span>
  );
}

/** True when this window is worth drawing at all: the same rule `agn usage` prints by. */
export function hasCurrentWindow(limit: PlanLimit, now: number): boolean {
  return (
    current(limit.fiveHour, limit.observedAt, now) !== null ||
    current(limit.week, limit.observedAt, now) !== null
  );
}

/** Without a reset time, an observation is worth showing for this long and no longer. */
const LIMIT_TTL_MS = 60 * 60 * 1_000;

/**
 * Core's `limitIsCurrent`, restated: the page bundles no runtime code from `@agnostic/core`, which
 * carries the process helpers. `limit-figures.test.tsx` pins core's own cases against this.
 */
function current(window: LimitWindow | null, observedAt: string, now: number): LimitWindow | null {
  if (window === null) {
    return null;
  }
  if (window.resetsAt !== null) {
    return Date.parse(window.resetsAt) > now ? window : null;
  }
  const observed = Date.parse(observedAt);
  return Number.isFinite(observed) && now - observed < LIMIT_TTL_MS ? window : null;
}

function figure(window: LimitWindow | null): string {
  return window === null ? STALE : formatPercent(window.usedPercent);
}

/** The budget cell's colours, so a plan near its ceiling reads the same as a budget near one. */
function fill(window: LimitWindow | null): string {
  if (window === null) {
    return "transparent";
  }
  if (window.usedPercent >= OVER_PERCENT) {
    return "var(--destructive)";
  }
  return window.usedPercent >= WARN_PERCENT ? "var(--status-waiting)" : "var(--foreground)";
}
