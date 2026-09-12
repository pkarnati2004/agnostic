import {
  type Outcome,
  type OutcomeResponse,
  outcomeVerdict,
  type TaskStatus,
} from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { renderFields } from "../fields.js";
import { requireTaskId } from "../resolve-repo.js";

export function outcomesCommand(ctx: CliContext): Command {
  return new Command("outcomes")
    .description("what a finished task cost, what its tests said, and whether it was kept")
    .argument("[task]", "task id or prefix; defaults to the task of the worktree you are in")
    .action(async (task: string | undefined, _flags: unknown, command: Command) => {
      const client = await ctx.client();
      const response = await client.taskOutcome(await requireTaskId(ctx, command, task));
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of render(response)) {
        ctx.io.out(line);
      }
    });
}

const TERMINAL: TaskStatus[] = ["done", "failed", "stopped"];

/** A task that is still going can already hold a tests-before row; the outcome is what close writes. */
function render({ task, outcome }: OutcomeResponse): string[] {
  if (outcome === null || !TERMINAL.includes(task.status)) {
    return [`outcome: not yet (task is ${task.status})`];
  }
  return renderFields([
    ["id", task.id],
    ["title", task.title],
    ["status", task.status],
    ["verdict", verdict(outcome)],
    ["profile", task.profileId],
    ["model", outcome.resolvedModel ?? "-"],
    ["duration", duration(outcome.durationSec)],
    ["tokens", count(outcome.tokens)],
    ["cost", cost(outcome)],
    ["tests", tests(outcome)],
    ["agent lines", count(outcome.agentLines)],
    ["human lines", humanLines(outcome)],
  ]);
}

/** A folder task and an adopted one have no branch of agn's, so there is nothing to have kept. */
function verdict(outcome: Outcome): string {
  if (outcome.accepted === null && outcome.reverted === null) {
    return "-";
  }
  const found = outcomeVerdict(outcome);
  return found === "open" ? "not merged" : found;
}

function tests(outcome: Outcome): string {
  return `before ${passed(outcome.testsBefore)}, after ${passed(outcome.testsAfter)}`;
}

function passed(result: boolean | null): string {
  if (result === null) {
    return "not run";
  }
  return result ? "pass" : "fail";
}

/** Nothing was priced and something ran: that is a subscription, not a task that was free. */
function cost(outcome: Outcome): string {
  if (outcome.costUsd !== null) {
    return `$${outcome.costUsd.toFixed(2)}`;
  }
  return outcome.tokens === 0 ? "-" : "included in plan";
}

function humanLines(outcome: Outcome): string {
  if (outcome.humanChangedLines === null) {
    return "-";
  }
  const lines = count(outcome.humanChangedLines);
  return outcome.humanEditRatio === null
    ? lines
    : `${lines} (${Math.round(outcome.humanEditRatio * 100)}%)`;
}

/** Hours, minutes and seconds, dropping the units that are zero on the left. */
function duration(seconds: number): string {
  const whole = Math.round(seconds);
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

// Grouped by hand rather than by locale, so the output is the same wherever agn runs.
function count(value: number | null): string {
  return value === null ? "-" : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
