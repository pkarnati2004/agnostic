import type { TaskUsageResponse } from "@agnostic/core";
import { formatCompact, formatTaskCost } from "./format-usage";

/** What the task in front has spent, at the bar's right end: one place on the page for a figure. */
export function TaskCost({ usage }: { usage: TaskUsageResponse | null }) {
  const spent =
    usage === null || usage.usage.tokens === 0
      ? null
      : `${formatCompact(usage.usage.tokens)} tok · ${formatTaskCost(usage.usage.costUsd, usage.billing)}`;
  return (
    <div
      data-cell="task"
      className="flex h-7 shrink-0 items-center gap-2 whitespace-nowrap border-border border-l px-3"
    >
      <span>This task</span>
      <span className="text-foreground">{spent ?? "no usage yet"}</span>
    </div>
  );
}
