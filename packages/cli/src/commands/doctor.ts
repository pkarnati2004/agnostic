import type { DoctorResponse, HarnessReport, ToolReport } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { type Column, renderTable } from "../table.js";
import { askForPlans, parsePlanFlags, planCell, planHint, unknownPlans } from "./doctor-plan.js";

const NOT_INSTALLED = "not installed";

const COLUMNS: Column<HarnessReport>[] = [
  { header: "harness", value: (row) => row.harness },
  { header: "version", value: (row) => row.version ?? "-" },
  { header: "login", value: (row) => (row.path === null ? "-" : row.login) },
  // Tier 1 means status, usage and recommendations; tier 2 means agn can launch it and little else.
  { header: "support", value: (row) => (row.tier === 1 ? "full" : "basic") },
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
    .action(async (flags: { plan: string[] }) => {
      const client = await ctx.client();
      const plans = parsePlanFlags(command, flags.plan);
      const response = await client.doctor(Object.keys(plans).length > 0 ? { plans } : undefined);
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      report(ctx, response);
      // Asking comes last: the table is the answer, and the question is about what is missing.
      const answered = await resolvePlans(ctx, response);
      if (answered) {
        report(ctx, await client.doctor({ plans: answered }));
      }
    });
  return command;
}

function report(ctx: CliContext, response: DoctorResponse): void {
  for (const line of renderTable(reported(response), COLUMNS)) {
    ctx.io.out(line);
  }
  for (const tool of response.tools) {
    ctx.io.out(toolLine(tool));
  }
  ctx.io.out(`profiles: ${response.profiles.length} available (agn profiles)`);
  ctx.io.out(`PATH: ${response.pathVar}`);
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

/** Every tier-1 harness is listed whether or not it is there; a tier-2 row only earns its line
 * once the binary exists, because the tier-2 list is long and mostly hypothetical. */
function reported(response: DoctorResponse): HarnessReport[] {
  return response.harnesses.filter((row) => row.tier === 1 || row.path !== null);
}

/** Not a harness and not in the table: `gh` is what `agn handoff` opens a pull request with. */
function toolLine(tool: ToolReport): string {
  if (tool.path === null) {
    return `tools: ${tool.tool} ${NOT_INSTALLED}`;
  }
  return `tools: ${tool.tool} ${tool.version ?? "-"} (${tool.login})`;
}

function models(row: HarnessReport): string {
  if (row.modelSource === "none" || row.models.length === 0) {
    return "none";
  }
  return `${row.models.length} (${row.modelSource === "probe" ? "probed" : "seed list"})`;
}
