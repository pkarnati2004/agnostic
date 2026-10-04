import type { DoctorResponse, HarnessReport, LimitCapture, ToolReport } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { type Column, renderTable } from "../table.js";
import { askForPlans, parsePlanFlags, planCell, planHint, unknownPlans } from "./doctor-plan.js";

const NOT_INSTALLED = "not installed";

const COLUMNS: Column<HarnessReport>[] = [
  { header: "harness", value: (row) => row.harness },
  { header: "version", value: (row) => row.version ?? "-" },
  { header: "login", value: (row) => (row.path === null ? "-" : row.login) },
  // full is status and usage, status is a live status with no token count, basic is launch only.
  { header: "support", value: (row) => row.support },
  { header: "usage", value: usage },
  { header: "models", value: models },
  { header: "plan", value: planCell },
  { header: "path", value: (row) => row.path ?? NOT_INSTALLED },
];

export function doctorCommand(ctx: CliContext): Command {
  const command = new Command("doctor")
    .description("detect installed agents, logins and models")
    .option(
      "--plan <vendor=plan>",
      "record the plan a vendor bills you on, e.g. claude=max20",
      collect,
      [],
    )
    .option("--verbose", "print the PATH agn searched even when nothing is missing")
    .action(async (flags: { plan: string[]; verbose?: boolean }) => {
      const client = await ctx.client();
      const plans = parsePlanFlags(command, flags.plan);
      const response = await client.doctor(Object.keys(plans).length > 0 ? { plans } : undefined);
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      const verbose = flags.verbose === true;
      report(ctx, response, verbose);
      // Asking comes last: the table is the answer, and the question is about what is missing.
      const answered = await resolvePlans(ctx, response);
      if (answered) {
        report(ctx, await client.doctor({ plans: answered }), verbose);
      }
    });
  return command;
}

function report(ctx: CliContext, response: DoctorResponse, verbose: boolean): void {
  for (const line of renderTable(reported(response), COLUMNS)) {
    ctx.io.out(line);
  }
  const missing = notInstalled(response);
  if (missing !== null) {
    ctx.io.out(missing);
  }
  for (const line of captureLines(reported(response))) {
    ctx.io.out(line);
  }
  for (const tool of response.tools) {
    ctx.io.out(toolLine(tool));
  }
  ctx.io.out(`profiles: ${response.profiles.length} available (agn profiles)`);
  if (verbose || pathExplainsAGap(response)) {
    ctx.io.out(`PATH: ${response.pathVar}`);
  }
  if (response.tmuxConfigStale) {
    ctx.io.out(
      "tmux server predates the current config; stop every task or run tmux -L agn kill-server",
    );
  }
}

/** agn never guesses a plan: on a terminal it asks, and in a pipe it says how to tell it. */
async function resolvePlans(ctx: CliContext, response: DoctorResponse) {
  const unknown = unknownPlans(response);
  if (unknown.length === 0) {
    return null;
  }
  if (ctx.stdin.isTTY !== true) {
    for (const row of unknown) {
      ctx.io.out(planHint(row, response.planOptions));
    }
    return null;
  }
  return askForPlans(ctx, response);
}

/** commander hands each `--plan` to the same option, so they collect rather than overwrite. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** The table is what the user has: every harness that is installed, whatever its tier, and any
 * harness they named in config.yaml or a task even though its binary is missing. */
function reported(response: DoctorResponse): HarnessReport[] {
  return response.harnesses.filter(
    (row) => row.path !== null || response.named.includes(row.harness),
  );
}

/** One line for the rest of the harnesses agn supports, so the table stays as short as the machine. */
function notInstalled(response: DoctorResponse): string | null {
  const missing = response.harnesses
    .filter((row) => row.tier === 1 && row.path === null && !response.named.includes(row.harness))
    .map((row) => row.harness);
  return missing.length === 0 ? null : `not installed: ${missing.join(", ")} (${missing.length})`;
}

/** The PATH only answers a question the user already has: a harness they named is missing, or agn
 * found no agent at all. Otherwise the per-harness path column has already said where each one is. */
function pathExplainsAGap(response: DoctorResponse): boolean {
  if (response.harnesses.every((row) => row.path === null)) {
    return true;
  }
  return response.harnesses.some(
    (row) => row.path === null && response.named.includes(row.harness),
  );
}

/**
 * Which of a harness's sessions report its plan's rate limit. One line per harness whose limits
 * come from a status line agn installs; the rest report in files they write themselves.
 */
function captureLines(rows: HarnessReport[]): string[] {
  return rows
    .filter((row) => row.limitSource === "statusline")
    .map((row) => `${row.harness} status-line capture: ${captureState(row.limitCapture)}`);
}

function captureState(capture: LimitCapture): string {
  switch (capture) {
    case "all-sessions":
      return "all sessions";
    case "agn-tasks":
      return "agn tasks only (hooks.claude_statusline: repo)";
    case "none":
      return "none yet - run agn hooks install, or start a task";
  }
}

/** Not a harness and not in the table: `gh` is what `agn handoff` opens a pull request with. */
function toolLine(tool: ToolReport): string {
  if (tool.path === null) {
    return `tools: ${tool.tool} ${NOT_INSTALLED}`;
  }
  return `tools: ${tool.tool} ${tool.version ?? "-"} (${tool.login})`;
}

/** Where this agent's tokens come from, or that nothing on the machine records them. */
function usage(row: HarnessReport): string {
  if (row.path === null) {
    return "-";
  }
  return row.usageSource ?? "not available";
}

function models(row: HarnessReport): string {
  if (row.modelSource === "none" || row.models.length === 0) {
    return "none";
  }
  return `${row.models.length} (${row.modelSource === "probe" ? "probed" : "seed list"})`;
}
