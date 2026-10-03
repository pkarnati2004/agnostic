import type { LimitFreshness, LimitWindow, PlanLimit } from "@agnostic/core";
import { limitFreshness } from "@agnostic/core/browser";
import { cn } from "../class-names";
import { formatPercent } from "./format-usage";

/** Where the 5-hour bar stops being a figure and starts being a warning. */
const WARN_PERCENT = 80;
const OVER_PERCENT = 95;

const BAR_WIDTH_PX = 48;
const BAR_HEIGHT_PX = 6;

/** A figure the account has had two hours to move is drawn, but not at full strength. */
const APPROXIMATE_OPACITY = 0.5;

/** A window agn has no figure for: an en dash, not a zero the user would read as spent. */
const STALE = "–";

/**
 * What the plan's own meter says: a bar for the 5-hour window, which is the one that moves within
 * a sitting, and the week beside it as text. ADR 029, amended 2026-09-30: no Fable figure here,
 * because the status-line payload carries no Fable window to draw one from.
 */
export function LimitFigures({ limit, now }: { limit: PlanLimit; now: number }) {
  const fiveHour = windowFreshness(limit.fiveHour, limit.observedAt, now);
  const week = windowFreshness(limit.week, limit.observedAt, now);
  const percent =
    limit.fiveHour === null || fiveHour === "stale" ? null : limit.fiveHour.usedPercent;
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
            width: `${percent === null ? 0 : Math.min(100, Math.max(0, percent))}%`,
            backgroundColor: percent === null ? "transparent" : barFill(percent),
            opacity: fiveHour === "approximate" ? APPROXIMATE_OPACITY : undefined,
          }}
        />
      </span>
      <span className="tabular-nums text-foreground">
        <Figure window={limit.fiveHour} named="five-hour" freshness={fiveHour} /> 5h ·{" "}
        <Figure window={limit.week} named="week" freshness={week} /> wk
      </span>
    </span>
  );
}

/** True when a window is worth drawing at all: the same rule `agn usage` prints by. */
export function hasFigure(limit: PlanLimit, now: number): boolean {
  return (
    windowFreshness(limit.fiveHour, limit.observedAt, now) !== "stale" ||
    windowFreshness(limit.week, limit.observedAt, now) !== "stale"
  );
}

/** A window the harness never reported has no figure at all, fresh or stale. */
function windowFreshness(
  window: LimitWindow | null,
  observedAt: string,
  now: number,
): LimitFreshness {
  return window === null ? "stale" : limitFreshness(window, observedAt, new Date(now));
}

/**
 * The budget cell's colours, so a plan near its ceiling reads the same as a budget near one. A
 * caller on another surface passes the colour its own text is drawn in as `base`.
 */
export function barFill(usedPercent: number, base = "var(--foreground)"): string {
  if (usedPercent >= OVER_PERCENT) {
    return "var(--destructive)";
  }
  return usedPercent >= WARN_PERCENT ? "var(--warning)" : base;
}

type FigureProps = {
  window: LimitWindow | null;
  named: "five-hour" | "week";
  freshness: LimitFreshness;
};

/** The tilde is text, not a glyph or a colour, so it reads the same here and in `agn usage`. */
function Figure({ window, named, freshness }: FigureProps) {
  const text =
    window === null || freshness === "stale"
      ? STALE
      : `${freshness === "approximate" ? "~" : ""}${formatPercent(window.usedPercent)}`;
  return (
    <span
      data-window={named}
      data-freshness={freshness}
      className={cn(freshness === "approximate" && "text-muted-foreground")}
    >
      {text}
    </span>
  );
}
