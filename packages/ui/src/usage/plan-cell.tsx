import type { PlanLimit, PlanUsage, PlanVendor } from "@agnostic/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { formatAgo, formatCount, formatMoney, formatShare, formatTokens3 } from "./format-usage";
import { hasFigure, LimitFigures } from "./limit-figures";
import { UsageRows, usageRows } from "./usage-rows";
import { VendorMark } from "./vendor-mark";

export type PlanCellProps = {
  label: string;
  vendor: PlanVendor | null;
  /** What the harness last said about this plan's own meter; null where nothing on this machine says. */
  limit: PlanLimit | null;
  day: PlanUsage | null;
  week: PlanUsage | null;
  now: number;
};

/** Under five minutes, "as of just now" tells the reader nothing they did not assume. */
const AGE_WORTH_SAYING_MS = 5 * 60_000;

/**
 * One plan's figures: the percent of its rate limit where a file on this machine reports one, and
 * the tokens and cost where none does. The week token pair drops out below `xl` and the cost
 * figures below `lg`; everything hidden is in the tooltip.
 */
export function PlanCell({ label, vendor, limit, day, week, now }: PlanCellProps) {
  const figures = limit !== null && hasFigure(limit, now);
  const rows = figures && limit !== null ? usageRows(vendor, limit, now) : [];
  const tokens = tokensLine(day, week);
  const cost = costLine(vendor, day, week);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <VendorMark vendor={vendor} />
          <span className="min-w-12 truncate font-medium text-foreground">{label}</span>
          {figures && limit !== null ? (
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
        <div className="flex flex-col gap-1.5">
          {rows.length > 0 && (
            <div data-line="rows">
              <UsageRows rows={rows} now={now} />
            </div>
          )}
          {rows.length > 0 && limit !== null && worthDating(limit, now) && (
            <span data-line="age" className="text-primary-foreground-muted">
              as of {formatAgo(limit.observedAt, now)}
            </span>
          )}
          {tokens !== null && (
            <span data-line="tokens" className="text-primary-foreground-muted">
              {tokens}
            </span>
          )}
          {cost !== null && <span data-line="cost">{cost}</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** The age dates the limit rows, not the tokens: the token counts are rescanned every minute. */
function worthDating(limit: PlanLimit, now: number): boolean {
  const observed = Date.parse(limit.observedAt);
  return Number.isFinite(observed) && now - observed >= AGE_WORTH_SAYING_MS;
}

/**
 * What the plan spent, week first, with agn's own share of it where sessions agn did not start
 * are in the total. ADR 029, amended 2026-09-30: the Fable share reads as a share of tokens here,
 * because agn has no Fable limit window and a percentage beside the others would read as one.
 */
function tokensLine(day: PlanUsage | null, week: PlanUsage | null): string | null {
  const periods: [PlanUsage, string][] = [];
  if (week !== null) {
    periods.push([week, "this week"]);
  }
  if (day !== null) {
    periods.push([day, "today"]);
  }
  if (periods.length === 0) {
    return null;
  }
  const parts = periods.map(([row, when], index) => {
    const mine =
      row.unattributedTokens === 0
        ? ""
        : `, ${formatTokens3(row.usage.tokens - row.unattributedTokens)} by agn`;
    return `${formatTokens3(row.usage.tokens)}${index === 0 ? " tokens" : ""} ${when}${mine}`;
  });
  const share = week?.fableShare ?? day?.fableShare ?? null;
  if (share !== null) {
    parts.push(`Fable ${formatShare(share)} of counted tokens`);
  }
  return parts.join(" · ");
}

/**
 * A subscription bills the plan, not the tokens, so the figure is what they would have cost on an
 * API key. A metered plan has a real cost and shows it.
 */
function costLine(
  vendor: PlanVendor | null,
  day: PlanUsage | null,
  week: PlanUsage | null,
): string | null {
  const known = week ?? day;
  if (known === null) {
    return null;
  }
  if (vendor !== null && known.usage.costUsd === null) {
    const api = week?.apiRateUsd ?? null;
    return api === null ? null : `≈ ${formatMoney(api)} at API rates, not billed`;
  }
  const parts: string[] = [];
  if (week?.usage.costUsd != null) {
    parts.push(`${formatMoney(week.usage.costUsd)} this week`);
  }
  if (day?.usage.costUsd != null) {
    parts.push(`${formatMoney(day.usage.costUsd)} today`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
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
