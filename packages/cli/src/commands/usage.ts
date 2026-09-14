import type { PlanUsage, TaskUsageResponse, UsageResponse, UsageWindow } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { renderFields } from "../fields.js";
import { worktreeTask } from "../resolve-repo.js";
import { type Column, renderTable } from "../table.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function usageCommand(ctx: CliContext): Command {
  return new Command("usage")
    .description("today's and this week's tokens per plan, or one task's")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined) => {
      // ADR 012: inside a worktree, `agn usage` is about that task, as `agn status` is.
      const id = task ?? (await worktreeTask(ctx.paths, ctx.cwd))?.taskId ?? null;
      await (id === null ? showWindows(ctx) : showTask(ctx, id));
    });
}

async function showWindows(ctx: CliContext): Promise<void> {
  const client = await ctx.client();
  const response = await client.usage();
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  print(ctx, response.day, "today");
  ctx.io.out("");
  print(ctx, response.week, "this week");
}

function print(
  ctx: CliContext,
  { window, plans }: UsageResponse["day"],
  label: "today" | "this week",
): void {
  ctx.io.out(`${label} (${heading(window)})`);
  if (plans.length === 0) {
    ctx.io.out(`no usage ${label}`);
    return;
  }
  for (const line of renderTable(plans, columns())) {
    ctx.io.out(line);
  }
}

/** The day the window starts, in the zone the daemon computed it in. */
function heading(window: UsageWindow): string {
  const since = new Date(window.since);
  const date = [
    since.getFullYear(),
    String(since.getMonth() + 1).padStart(2, "0"),
    String(since.getDate()).padStart(2, "0"),
  ].join("-");
  return window.kind === "day" ? date : `from ${DAYS[since.getDay()]} ${date}`;
}

function columns(): Column<PlanUsage>[] {
  const right = "right" as const;
  return [
    { header: "plan", value: (row) => (row.plan === null ? "unknown plan" : label(row)) },
    { header: "agent", value: (row) => row.harness },
    { header: "tokens", value: (row) => count(row.usage.tokens), align: right },
    { header: "input", value: (row) => count(row.usage.tokensInput), align: right },
    { header: "output", value: (row) => count(row.usage.tokensOutput), align: right },
    { header: "cache read", value: (row) => count(row.usage.tokensCacheRead), align: right },
    { header: "cache write", value: (row) => count(row.usage.tokensCacheWrite), align: right },
    { header: "cost", value: (row) => money(row.usage.costUsd), align: right },
    { header: "fable", value: (row) => share(row.fableShare), align: right },
  ];
}

function label(row: PlanUsage): string {
  return row.vendor === null ? String(row.plan) : `${row.vendor} ${row.plan}`;
}

async function showTask(ctx: CliContext, id: string): Promise<void> {
  const client = await ctx.client();
  const response = await client.taskUsage(id);
  if (ctx.json) {
    writeJson(ctx.io, response);
    return;
  }
  if (response.usage.tokens === 0) {
    ctx.io.out(`no usage recorded for ${response.task.id}`);
    return;
  }
  for (const line of renderFields(fields(response))) {
    ctx.io.out(line);
  }
}

function fields({ task, usage, billing }: TaskUsageResponse): [string, string][] {
  return [
    ["id", task.id],
    ["title", task.title],
    ["profile", task.profileId],
    ["tokens", count(usage.tokens)],
    ["input", count(usage.tokensInput)],
    ["output", count(usage.tokensOutput)],
    ["cache read", count(usage.tokensCacheRead)],
    ["cache write", count(usage.tokensCacheWrite)],
    ["cost", cost(usage.costUsd, billing)],
  ];
}

/** A subscription run has no price; saying so is more use than a dash the user has to decode. */
function cost(costUsd: number | null, billing: TaskUsageResponse["billing"]): string {
  if (costUsd === null && (billing === "subscription" || billing === "local")) {
    return "included in plan";
  }
  return money(costUsd);
}

function money(costUsd: number | null): string {
  return costUsd === null ? "-" : `$${costUsd.toFixed(2)}`;
}

function share(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

// Grouped by hand rather than by locale, so the output is the same wherever agn runs.
function count(tokens: number | null): string {
  return tokens === null ? "-" : String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
