import type { BudgetReport, BudgetWindow } from "@agnostic/core";
import { cn } from "../class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { budgetLine, budgetPercent, budgetTone } from "./budget-line";

/**
 * The machine's spend against the ceilings in config.yaml, drawn after the plan cells when there
 * is a ceiling to draw. The week line drops out below `xl`, as the plan cells' week figures do,
 * and the tooltip says what the percentage means for the next run.
 */
export function BudgetCell({ budget }: { budget: BudgetReport }) {
  if (budget.day === null && budget.week === null) {
    return null;
  }
  const tone = budgetTone(budget);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 whitespace-nowrap",
            tone === "exceeded" && "text-destructive",
          )}
          style={tone === "warn" ? { color: "var(--status-waiting)" } : undefined}
        >
          <span className="shrink-0 font-medium">budget</span>
          {budget.day !== null && (
            <span className="shrink-0 tabular-nums">{budgetLine(budget.day, "today")}</span>
          )}
          {budget.week !== null && (
            <span className="hidden shrink-0 tabular-nums xl:inline">
              {budgetLine(budget.week, "wk")}
            </span>
          )}
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
