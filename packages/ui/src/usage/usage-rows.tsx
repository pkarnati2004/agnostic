import type { LimitFreshness, PlanLimit } from "@agnostic/core";
import { cn } from "../class-names";
import { formatPercent, formatReset } from "./format-usage";
import { barFill, windowFreshness } from "./limit-figures";

const BAR_WIDTH_PX = 72;
const BAR_HEIGHT_PX = 6;

/**
 * The panel draws on the tooltip's primary surface, where the cell bar's page foreground is all
 * but invisible; the track takes the same surface's muted colour.
 */
const TOOLTIP_FILL = "var(--primary-foreground)";

/** A window agn has no figure for: an en dash, not a zero the user would read as spent. */
const STALE = "–";

/** One line of the panel: a window of the plan's own meter, named by its length. */
export type UsageRow = {
  key: "five-hour" | "week";
  label: string;
  resetsAt: string | null;
  /** Null for a stale window, which keeps its line and loses its figure. */
  percent: number | null;
  freshness: LimitFreshness;
};

/**
 * The rows for one plan, in the order a vendor's own usage panel lists them. Every vendor's
 * five-hour window carries the same label, because a reader comparing two plans should not have
 * to work out that Claude Code's "current session" is the window Codex calls five hours. A window
 * the harness never reported has no row at all.
 */
export function usageRows(limit: PlanLimit, now: number): UsageRow[] {
  const rows: UsageRow[] = [];
  if (limit.fiveHour !== null) {
    rows.push(row("five-hour", "5-hour window", limit.fiveHour, limit, now));
  }
  if (limit.week !== null) {
    rows.push(row("week", "This week", limit.week, limit, now));
  }
  return rows;
}

/** A bar and a percentage per window, so the panel reads like the one the harness prints. */
export function UsageRows({ rows, now }: { rows: UsageRow[]; now: number }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <div
          key={row.key}
          data-row={row.key}
          data-freshness={row.freshness}
          className={cn(
            "flex items-center gap-3",
            row.freshness === "approximate" && "text-primary-foreground-muted",
          )}
        >
          <span className="flex min-w-28 flex-col">
            <span>{row.label}</span>
            {row.resetsAt !== null && (
              <span className="text-primary-foreground-muted">
                Resets at {formatReset(row.resetsAt, now)}
              </span>
            )}
          </span>
          <span
            data-testid={`${row.key}-row-track`}
            className="shrink-0 overflow-hidden rounded-full bg-primary-foreground-muted"
            style={{ width: BAR_WIDTH_PX, height: BAR_HEIGHT_PX }}
          >
            <span
              className="block h-full rounded-full"
              data-testid={`${row.key}-row-bar`}
              style={{
                width: `${row.percent === null ? 0 : Math.min(100, Math.max(0, row.percent))}%`,
                backgroundColor:
                  row.percent === null ? "transparent" : barFill(row.percent, TOOLTIP_FILL),
              }}
            />
          </span>
          <span className="ml-auto tabular-nums">{used(row)}</span>
        </div>
      ))}
    </div>
  );
}

function used(row: UsageRow): string {
  if (row.percent === null) {
    return STALE;
  }
  const about = row.freshness === "approximate" ? "~" : "";
  return `${about}${formatPercent(row.percent)} used`;
}

function row(
  key: UsageRow["key"],
  label: string,
  window: NonNullable<PlanLimit["fiveHour"]>,
  limit: PlanLimit,
  now: number,
): UsageRow {
  const freshness = windowFreshness(window, limit.observedAt, now);
  const stale = freshness === "stale";
  return {
    key,
    label,
    // A reset that has passed is no use to the reader, so a stale row loses it with its figure.
    resetsAt: stale ? null : window.resetsAt,
    percent: stale ? null : window.usedPercent,
    freshness,
  };
}
