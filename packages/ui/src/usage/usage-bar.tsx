import type { PlanUsage, UsageResponse } from "@agnostic/core";
import type { ReactNode } from "react";
import { planLabel } from "./format-usage";
import { PlanCell } from "./plan-cell";
import { lastResponse, type UsageState } from "./usage-state";

type Row = {
  harness: PlanUsage["harness"];
  label: string;
  day: PlanUsage | null;
  week: PlanUsage | null;
};

/**
 * What every plan spent today and this week, in the same figures `agn usage` prints. One row that
 * never wraps: a window too narrow for every plan shortens the plan labels, then scrolls sideways.
 */
export function UsageBar({ state }: { state: UsageState }) {
  const response = lastResponse(state);
  if (response === null) {
    const message =
      state.kind === "error" ? `usage unavailable: ${state.error.message}` : "reading usage…";
    return <Bar>{message}</Bar>;
  }
  const rows = planRows(response);
  const windows = { day: response.day.window, week: response.week.window };
  return (
    <Bar>
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
    </Bar>
  );
}

function Bar({ children }: { children: ReactNode }) {
  return (
    <footer className="flex h-9 w-full shrink-0 items-center gap-4 overflow-x-auto border-border border-t bg-muted/40 px-4 text-muted-foreground text-xs">
      {children}
    </footer>
  );
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
