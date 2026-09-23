import type {
  Billing,
  CompareChanges,
  Outcome,
  Task,
  TaskListRow,
  TaskStatus,
  UsageSum,
} from "@agnostic/core";
import { formatMoney } from "../usage/format-usage";

// The page cannot import `agn compare`'s own formatters - the CLI is not in this bundle - so the
// rules are restated here and compare-lines.test.ts pins the CLI's cases against them.
const LIVE_FIRST: TaskStatus[] = ["running", "waiting", "queued", "done", "failed", "stopped"];

const TERMINAL: TaskStatus[] = ["done", "failed", "stopped"];

type SummaryTask = Pick<TaskListRow, "status">;

/**
 * What the sidebar row says the agents are doing. It never says which one a pick kept: only the
 * daemon knows that (`pickedTaskId`, ADR 036 Q7), and the Compare view is where it is read.
 */
export function compareSummary(group: { tasks: SummaryTask[] }): string {
  return LIVE_FIRST.filter((status) => count(group.tasks, status) > 0)
    .map((status) => `${count(group.tasks, status)} ${status}`)
    .join(", ");
}

function count(tasks: SummaryTask[], status: TaskStatus): number {
  return tasks.filter((task) => task.status === status).length;
}

/** Null is git declining to count, which the column says with a dash rather than a zero. */
export function changesCell(changes: CompareChanges | null): { files: string; lines: string } {
  if (changes === null) {
    return { files: "-", lines: "-" };
  }
  return { files: String(changes.files), lines: `+${changes.additions} -${changes.deletions}` };
}

/** The tests the close work recorded; a sibling stopped a moment ago has none for a few seconds. */
export function testsCell(outcome: Outcome | null): string {
  if (outcome === null || outcome.testsAfter === null) {
    return "-";
  }
  return outcome.testsAfter ? "pass" : "fail";
}

/** Nothing priced on a plan agn knows is spend the plan absorbed, not spend of zero. */
export function costCell(usage: UsageSum, billing: Billing | null): string {
  if (usage.costUsd !== null) {
    return formatMoney(usage.costUsd);
  }
  return billing === "subscription" || billing === "local" ? "in plan" : "-";
}

/** What the outcome measured once the agent is done, and the wall clock until then. */
export function timeCell(
  task: Pick<Task, "status" | "createdAt">,
  outcome: Outcome | null,
  now: number,
): string {
  if (outcome !== null && TERMINAL.includes(task.status)) {
    return duration(outcome.durationSec);
  }
  return duration((now - Date.parse(task.createdAt)) / 1000);
}

/** The `agn outcomes` form: hours, minutes and seconds, dropping the zeros on the left. */
function duration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const parts = [
    [Math.floor(whole / 3600), "h"],
    [Math.floor(whole / 60) % 60, "m"],
    [whole % 60, "s"],
  ] as const;
  const from = parts.findIndex(([value]) => value > 0);
  return parts
    .slice(from === -1 ? parts.length - 1 : from)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ");
}
