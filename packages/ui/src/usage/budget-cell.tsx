import type { BudgetReport, BudgetState, BudgetWindow } from "@agnostic/core";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { budgetLine, budgetNotice, budgetPercent, budgetTone } from "./budget-line";

/** How much of the tone's colour the cell takes: enough to catch the eye and no more. */
const TINT: Record<BudgetState, number> = { ok: 0, warn: 7, exceeded: 8 };

const TOKEN: Record<BudgetState, string> = {
  ok: "--muted-foreground",
  warn: "--warning",
  exceeded: "--destructive",
};

/**
 * The machine's spend against the ceilings in config.yaml, drawn after the plan cells when there is
 * a ceiling to draw. It is its own cell and never a plan's, because a subscription plan's spend is
 * not counted against a budget at all (ADR 036 Q8). The week line drops out below `xl`.
 */
export function BudgetCell({ budget }: { budget: BudgetReport }) {
  if (budget.day === null && budget.week === null) {
    return null;
  }
  const tone = budgetTone(budget);
  const colour = `var(${TOKEN[tone]})`;
  const notice = budgetNotice(tone);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-cell="budget"
          data-tone={tone}
          className="flex h-7 shrink-0 items-center gap-2 whitespace-nowrap border-border border-r px-3"
          style={
            TINT[tone] === 0
              ? undefined
              : { backgroundColor: `color-mix(in srgb, ${colour} ${TINT[tone]}%, transparent)` }
          }
        >
          <span>budget</span>
          {budget.day !== null && (
            <span className="type-mono tabular-nums">{budgetLine(budget.day, "today")}</span>
          )}
          {budget.week !== null && (
            <span className="hidden type-mono tabular-nums xl:inline">
              {budgetLine(budget.week, "week")}
            </span>
          )}
          {notice !== null && <span style={{ color: colour }}>{notice}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <Spent window={budget.day} named="daily" />
          <Spent window={budget.week} named="weekly" />
          <span>
            api-key and credits runs are refused at 100%; subscription runs are never counted.
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function Spent({ window, named }: { window: BudgetWindow | null; named: "daily" | "weekly" }) {
  if (window === null) {
    return null;
  }
  return (
    <span>
      {budgetPercent(window)}% of the {named} budget is spent.
    </span>
  );
}
