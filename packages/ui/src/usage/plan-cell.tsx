import type { PlanUsage, UsageWindow } from "@agnostic/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { formatCount, formatMoney, formatShare, windowHeading } from "./format-usage";

/** The calendar day and the calendar week the two figure pairs cover. */
export type Windows = { day: UsageWindow; week: UsageWindow };

/** ADR 016: half of a Claude plan's tokens on Fable is the line the bar draws. */
const FABLE_LINE = 0.5;

export type PlanCellProps = {
  label: string;
  day: PlanUsage | null;
  week: PlanUsage | null;
  windows: Windows;
};

/**
 * One plan's figures. The week pair drops out below `xl` and the cost figures below `lg`, so a
 * 13-inch window keeps the tokens and the Fable share; everything hidden is in the tooltip. The
 * label is the only part that shrinks, so a fourth plan shortens names before the bar scrolls.
 */
export function PlanCell({ label, day, week, windows }: PlanCellProps) {
  const fable = day?.fableShare ?? week?.fableShare ?? null;
  const heavy = fable !== null && fable >= FABLE_LINE;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <span className="min-w-12 truncate font-medium text-foreground">{label}</span>
          <Figures when="today" row={day} />
          <span className="hidden xl:contents">
            <Figures when="week" row={week} />
          </span>
          {(day ?? week)?.vendor === "claude" && (
            <span className="shrink-0 text-muted-foreground">
              fable{" "}
              <span style={heavy ? { color: "var(--status-waiting)" } : undefined}>
                {formatShare(fable)}
              </span>
            </span>
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
          {heavy && <span>more than half of this plan's tokens ran on Fable</span>}
        </div>
      </TooltipContent>
    </Tooltip>
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
