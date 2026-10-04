import type {
  Plan,
  PlanLimit,
  PlanUsage,
  PlanVendor,
  TaskUsageResponse,
  UsageResponse,
} from "@agnostic/core";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { cn } from "../class-names";
import { BudgetCell } from "./budget-cell";
import { planLabel } from "./format-usage";
import { PlanCell, type PlanCellQuestion } from "./plan-cell";
import { TaskCost } from "./task-cost";
import { lastResponse, type UsageState } from "./usage-state";
import { usePlanOptions } from "./use-plan-options";

type Row = {
  harness: PlanUsage["harness"];
  label: string;
  vendor: PlanVendor | null;
  plan: Plan | null;
  limit: PlanLimit | null;
  day: PlanUsage | null;
  week: PlanUsage | null;
};

// Long enough to find the bar with the eye, short enough to be gone before the next glance.
const FLASH_MS = 1_500;

type UsageBarProps = {
  state: UsageState;
  /** Counts the times the page was asked for the cost; each one brings the bar into view. */
  flash: number;
  /** What the tab in front has spent, read by the page that knows which tab that is. */
  taskUsage: TaskUsageResponse | null;
  /** False for the Compare tab and the New task tab, which have no task of their own. */
  showTask: boolean;
  /** For the plan question alone: `POST /doctor` reads the options and writes the answer. */
  client: WorkspaceClient;
  /** Re-reads `GET /usage`, so a plan the user just named shows its figures at once. */
  refresh: () => void;
};

/**
 * What every plan spent, in the same figures `agn usage` prints: a cell per plan, the budget after
 * them, and the task in front at the right end. One row of 28 px that never wraps; a window too
 * narrow for every cell scrolls sideways.
 */
export function UsageBar({ state, flash, taskUsage, showTask, client, refresh }: UsageBarProps) {
  const { bar, lit } = useFlash(flash);
  const response = lastResponse(state);
  const rows = response === null ? [] : planRows(response);
  const { options, busy, setPlan } = usePlanOptions(client, rows.some(unknownPlan));
  const [failed, setFailed] = useState<string | null>(null);

  if (response === null) {
    const message =
      state.kind === "error" ? `usage unavailable: ${state.error.message}` : "reading usage…";
    return (
      <Bar ref={bar} lit={lit}>
        <Message>{message}</Message>
      </Bar>
    );
  }
  // The scan's own clock, so every cell in one draw decides freshness against the same instant.
  const now = Date.parse(response.scannedAt);
  const question = (vendor: PlanVendor): PlanCellQuestion => ({
    options,
    busy,
    error: failed,
    onPick: (planId) => {
      setFailed(null);
      setPlan(vendor, planId).then(refresh, (cause: unknown) => setFailed(refusal(cause)));
    },
  });
  return (
    <Bar ref={bar} lit={lit}>
      {rows.length === 0 ? (
        <Message>no usage today</Message>
      ) : (
        rows.map((row) => (
          <PlanCell
            key={row.harness}
            label={row.label}
            vendor={row.vendor}
            plan={row.plan}
            limit={row.limit}
            day={row.day}
            week={row.week}
            now={now}
            question={unknownPlan(row) && row.vendor !== null ? question(row.vendor) : null}
          />
        ))
      )}
      <BudgetCell budget={response.budget} />
      <div className="flex-1" />
      {showTask && <TaskCost usage={taskUsage} />}
    </Bar>
  );
}

type BarProps = { children: ReactNode; lit: boolean; ref: RefObject<HTMLElement | null> };

function Bar({ children, lit, ref }: BarProps) {
  return (
    <footer
      ref={ref}
      className={cn(
        "flex h-7 w-full shrink-0 items-stretch overflow-x-auto border-border border-t bg-background text-muted-foreground type-meta",
        lit && "ring-2 ring-ring ring-inset",
      )}
    >
      {children}
    </footer>
  );
}

/** What the bar says when it has no figures to show: one cell, in the cells' own padding. */
function Message({ children }: { children: string }) {
  return <span className="flex items-center px-3">{children}</span>;
}

/** A vendor bills this harness by plan and nothing said which plan it is: the cell has to ask. */
function unknownPlan(row: Row): boolean {
  return row.plan === null && row.vendor !== null;
}

function refusal(cause: unknown): string {
  return cause instanceof Error ? cause.message : "the plan could not be saved";
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
  const limits = new Map(response.limits.map((limit) => [limit.harness, limit]));
  const row = (plan: PlanUsage, day: PlanUsage | null): Row => ({
    harness: plan.harness,
    label: planLabel(plan),
    vendor: plan.vendor,
    plan: plan.plan,
    limit: limits.get(plan.harness) ?? null,
    day,
    week: week.get(plan.harness) ?? null,
  });
  const rows: Row[] = response.day.plans.map((plan) => row(plan, plan));
  const shown = new Set(response.day.plans.map((plan) => plan.harness));
  for (const plan of response.week.plans) {
    if (!shown.has(plan.harness)) {
      rows.push(row(plan, null));
    }
  }
  return rows;
}
