import type { Plan, PlanLimit, PlanOption, PlanUsage, PlanVendor } from "@agnostic/core";
import { formatAgo, formatTokens3, limitDetailParts } from "@agnostic/core/browser";
import type { ComponentProps } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { NoticeLine } from "../notice/notice-line";
import { VendorMark } from "../profile/harness-mark";
import { formatMoney, formatShare } from "./format-usage";
import { hasFigure, LimitFigures } from "./limit-figures";
import { PlanQuestion } from "./plan-question";
import { TokenFigures } from "./token-figures";
import { UsageRows, usageRows } from "./usage-rows";

/** What the cell asks with when nothing said which plan this vendor bills the user on. */
export type PlanCellQuestion = {
  options: PlanOption[] | null;
  busy: boolean;
  /** Why the last pick did not stick, drawn in the cell itself; null while nothing has failed. */
  error: string | null;
  onPick: (planId: string) => void;
};

export type PlanCellProps = {
  label: string;
  vendor: PlanVendor | null;
  plan: Plan | null;
  /** What the harness last said about this plan's own meter; null where nothing on this machine says. */
  limit: PlanLimit | null;
  day: PlanUsage | null;
  week: PlanUsage | null;
  now: number;
  question: PlanCellQuestion | null;
};

/** Under five minutes, "as of just now" tells the reader nothing they did not assume. */
const AGE_WORTH_SAYING_MS = 5 * 60_000;

/**
 * One width for every plan's panel, wide enough for a window row and for the tokens line to wrap
 * in, so hovering two plans in turn does not resize the panel under the pointer.
 */
const PANEL_WIDTH_PX = 320;

/**
 * One plan: the percent of its rate limit where a file on this machine reports one, the tokens and
 * cost where none does, and the question in place of either while agn cannot tell which plan it is.
 * The tooltip is a compact copy of the vendor's own usage panel.
 */
export function PlanCell(props: PlanCellProps) {
  const { label, vendor, limit, day, week, now, question } = props;
  if (props.plan === null && vendor !== null && question !== null) {
    return (
      <Cell state="unknown" vendor={vendor}>
        <VendorMark vendor={vendor} />
        <PlanQuestion
          vendor={vendor}
          options={question.options}
          busy={question.busy}
          onPick={question.onPick}
        />
        {question.error !== null && (
          <NoticeLine tone="error" className="border-b-0 px-0 py-0 type-meta">
            {question.error}
          </NoticeLine>
        )}
      </Cell>
    );
  }
  const figures = limit !== null && hasFigure(limit, now);
  // The cell falls back to tokens once every window is stale, but the panel still owes the reader
  // the windows and their age: a panel of tokens alone reads as a panel that failed to load.
  const rows = limit === null ? [] : usageRows(limit, now);
  const tokens = tokensLine(day, week);
  const cost = costLine(vendor, day, week);
  // What the limit source carried beside its windows: the account's credits and plan, or the
  // reporting session's cost and context. Empty for a source that carried neither.
  const detail = limit === null ? [] : limitDetailParts(limit.detail);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Cell state={figures ? "percent" : "tokens"} vendor={vendor}>
          <VendorMark vendor={vendor} />
          <span className="text-foreground">{label}</span>
          {figures && limit !== null ? (
            <LimitFigures limit={limit} now={now} />
          ) : (
            <TokenFigures day={day} week={week} vendor={vendor} />
          )}
        </Cell>
      </TooltipTrigger>
      <TooltipContent className="whitespace-normal" style={{ width: PANEL_WIDTH_PX }}>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">{label}</span>
          {rows.length > 0 && (
            <div data-line="rows">
              <UsageRows rows={rows} now={now} />
            </div>
          )}
          {rows.length > 0 && limit !== null && worthDating(limit, now) && (
            <span data-line="age" className="text-primary-foreground-muted">
              as of {formatAgo(limit.observedAt, new Date(now))}
            </span>
          )}
          {tokens !== null && (
            <span data-line="tokens" className="text-primary-foreground-muted">
              {tokens}
            </span>
          )}
          {detail.length > 0 && (
            <span data-line="detail" className="text-primary-foreground-muted">
              {detail.join(" · ")}
            </span>
          )}
          {cost !== null && <span data-line="cost">{cost}</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** The design's hairline-separated cell: 28 px tall, one line, never wrapped. */
function Cell({
  state,
  vendor,
  children,
  ...rest
}: ComponentProps<"div"> & { state: "percent" | "tokens" | "unknown"; vendor: PlanVendor | null }) {
  return (
    // `rest` first: the tooltip trigger passes a `data-state` of its own, and this cell's state is
    // the one the page and its tests read.
    <div
      {...rest}
      data-cell="plan"
      data-state={state}
      data-vendor={vendor ?? undefined}
      className="flex h-7 shrink-0 items-center gap-2 whitespace-nowrap border-border border-r px-3"
    >
      {children}
    </div>
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
