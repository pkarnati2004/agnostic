import type { TaskUsageResponse } from "@agnostic/core";
import { formatCount, formatTaskCost } from "./format-usage";

/** What this task has spent, in the header where Stop and Resume are: one place per task. */
export function TaskCost({ usage }: { usage: TaskUsageResponse | null }) {
  const text =
    usage === null || usage.usage.tokens === 0
      ? "no usage yet"
      : `${formatCount(usage.usage.tokens)} tokens · ${formatTaskCost(usage.usage.costUsd, usage.billing)}`;
  return <span className="whitespace-nowrap text-muted-foreground text-xs">{text}</span>;
}
