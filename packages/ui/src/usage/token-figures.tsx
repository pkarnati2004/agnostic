import type { PlanUsage, PlanVendor } from "@agnostic/core";
import { cn } from "../class-names";
import { formatCompact, formatMoney } from "./format-usage";

/**
 * What a plan spent when nothing on this machine reports its rate limit: tokens for each window,
 * and a price only where agn could put one on them. A subscription prices nothing, so the cell says
 * so instead of leaving the user to read a missing figure. The week pair drops out below `xl`.
 */
export function TokenFigures({
  day,
  week,
  vendor,
}: {
  day: PlanUsage | null;
  week: PlanUsage | null;
  vendor: PlanVendor | null;
}) {
  const priced = costOf(day) !== null || costOf(week) !== null;
  return (
    <>
      {day !== null && <Window when="today" row={day} lead />}
      {week !== null && (
        <span className="hidden xl:contents">
          <Window when="week" row={week} />
        </span>
      )}
      {/* A harness billed per provider key has no plan to be included in, so it says nothing. */}
      {!priced && vendor !== null && <span>included in plan</span>}
    </>
  );
}

/** Today's figure is the one being spent now, so it reads first; the week's stays quieter. */
function Window({ when, row, lead }: { when: string; row: PlanUsage; lead?: boolean }) {
  const cost = costOf(row);
  return (
    <>
      <span>{when}</span>
      <span className={cn("type-mono tabular-nums", lead === true && "text-foreground")}>
        {formatCompact(row.usage.tokens)} tok
        {cost === null ? "" : ` · ${formatMoney(cost)}`}
      </span>
    </>
  );
}

function costOf(row: PlanUsage | null): number | null {
  return row?.usage.costUsd ?? null;
}
