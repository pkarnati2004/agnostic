import type { PlanUsage, UsageResponse } from "@agnostic/core";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "../class-names";
import { BudgetCell } from "./budget-cell";
import { planLabel } from "./format-usage";
import { PlanCell } from "./plan-cell";
import { lastResponse, type UsageState } from "./usage-state";

type Row = {
  harness: PlanUsage["harness"];
  label: string;
  day: PlanUsage | null;
  week: PlanUsage | null;
};

// Long enough to find the bar with the eye, short enough to be gone before the next glance.
const FLASH_MS = 1_500;

/**
 * What every plan spent today and this week, in the same figures `agn usage` prints. One row that
 * never wraps: a window too narrow for every plan shortens the plan labels, then scrolls sideways.
 * `flash` counts the times the page was asked for the cost; each one brings the bar into view.
 */
export function UsageBar({ state, flash }: { state: UsageState; flash: number }) {
  const { bar, lit } = useFlash(flash);
  const response = lastResponse(state);
  if (response === null) {
    const message =
      state.kind === "error" ? `usage unavailable: ${state.error.message}` : "reading usage…";
    return (
      <Bar ref={bar} lit={lit}>
        {message}
      </Bar>
    );
  }
  const rows = planRows(response);
  const windows = { day: response.day.window, week: response.week.window };
  return (
    <Bar ref={bar} lit={lit}>
      {rows.length === 0 ? (
        <span>no usage today</span>
      ) : (
        rows.map((row) => (
          <PlanCell
            key={row.harness}
            label={row.label}
            day={row.day}
            week={row.week}
            windows={windows}
          />
        ))
      )}
      <BudgetCell budget={response.budget} />
    </Bar>
  );
}

type BarProps = { children: ReactNode; lit: boolean; ref: RefObject<HTMLElement | null> };

function Bar({ children, lit, ref }: BarProps) {
  return (
    <footer
      ref={ref}
      className={cn(
        "flex h-9 w-full shrink-0 items-center gap-4 overflow-x-auto border-border border-t bg-muted/40 px-4 text-muted-foreground text-xs",
        lit && "ring-2 ring-ring ring-inset",
      )}
    >
      {children}
    </footer>
  );
}

/** The Cost command has no page of its own to open, so it brings the bar to the user instead. */
function useFlash(flash: number) {
  const bar = useRef<HTMLElement>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    if (flash === 0) {
      return;
    }
    bar.current?.scrollIntoView({ block: "nearest" });
    setLit(true);
    const timer = setTimeout(() => setLit(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);
  return { bar, lit };
}

/** Day order first, because that is what the user is spending now; a week-only plan follows. */
function planRows(response: UsageResponse): Row[] {
  const week = new Map(response.week.plans.map((plan) => [plan.harness, plan]));
  const rows: Row[] = response.day.plans.map((plan) => ({
    harness: plan.harness,
    label: planLabel(plan),
    day: plan,
    week: week.get(plan.harness) ?? null,
  }));
  const shown = new Set(response.day.plans.map((plan) => plan.harness));
  for (const plan of response.week.plans) {
    if (!shown.has(plan.harness)) {
      rows.push({ harness: plan.harness, label: planLabel(plan), day: null, week: plan });
    }
  }
  return rows;
}
