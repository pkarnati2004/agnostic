import type { PlanLimit, PlanUsage, PlanVendor, UsageWindow } from "@agnostic/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { formatAgo, formatCount, formatMoney, formatReset, windowHeading } from "./format-usage";
import { hasCurrentWindow, LimitFigures } from "./limit-figures";
import { VendorMark } from "./vendor-mark";

/** The calendar day and the calendar week the two figure pairs cover. */
export type Windows = { day: UsageWindow; week: UsageWindow };

export type PlanCellProps = {
  label: string;
  vendor: PlanVendor | null;
  /** What the harness last said about this plan's own meter; null where nothing on this machine says. */
  limit: PlanLimit | null;
  day: PlanUsage | null;
  week: PlanUsage | null;
  windows: Windows;
  now: number;
};

/**
 * One plan's figures: the percent of its rate limit where a file on this machine reports one, and
 * the tokens and cost where none does. The week token pair drops out below `xl` and the cost
 * figures below `lg`; everything hidden is in the tooltip.
 */
export function PlanCell({ label, vendor, limit, day, week, windows, now }: PlanCellProps) {
  const current = limit !== null && hasCurrentWindow(limit, now);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <VendorMark vendor={vendor} />
          <span className="min-w-12 truncate font-medium text-foreground">{label}</span>
          {current && limit !== null ? (
            <LimitFigures limit={limit} now={now} />
          ) : (
            <>
              <Figures when="today" row={day} />
              <span className="hidden xl:contents">
                <Figures when="week" row={week} />
              </span>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{label}</span>
          <span>{line("today", windowHeading(windows.day), day)}</span>
          <span>{line("this week", windowHeading(windows.week), week)}</span>
          {unattributed("today", day)}
          {unattributed("this week", week)}
          {current && limit !== null && <Resets limit={limit} now={now} />}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * When each window turns over, and how old the figure is. The percentages are the account's, not
 * this machine's, so a run outside agn moves them without agn seeing it until the next turn.
 */
function Resets({ limit, now }: { limit: PlanLimit; now: number }) {
  const parts: string[] = [];
  if (limit.fiveHour?.resetsAt != null) {
    parts.push(`5h window resets ${formatReset(limit.fiveHour.resetsAt, now)}`);
  }
  if (limit.week?.resetsAt != null) {
    parts.push(`week resets ${formatReset(limit.week.resetsAt, now)}`);
  }
  return (
    <>
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
      <span>as of {formatAgo(limit.observedAt, now)}</span>
    </>
  );
}

function Figures({ when, row }: { when: string; row: PlanUsage | null }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
      <span>{when}</span>
      <span className="text-foreground tabular-nums">{formatCount(row?.usage.tokens ?? null)}</span>
      <span className="hidden tabular-nums lg:inline">
        {formatMoney(row?.usage.costUsd ?? null)}
      </span>
    </span>
  );
}

function line(when: string, heading: string, row: PlanUsage | null): string {
  const tokens = formatCount(row?.usage.tokens ?? null);
  return `${when} ${heading}: ${tokens} tokens · ${formatMoney(row?.usage.costUsd ?? null)}`;
}

/** Tokens the plan's meter counts and agn cannot price, kept out of the row itself (ADR 021). */
function unattributed(when: string, row: PlanUsage | null) {
  if (row === null || row.unattributedTokens === 0) {
    return null;
  }
  return (
    <span key={when}>
      {when} {formatCount(row.unattributedTokens)} from sessions agn did not start
    </span>
  );
}
