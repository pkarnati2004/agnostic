import type { DoctorResponse, HarnessReport, ToolReport } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { type Column, renderTable } from "../table.js";

const NOT_INSTALLED = "not installed";

const COLUMNS: Column<HarnessReport>[] = [
  { header: "harness", value: (row) => row.harness },
  { header: "version", value: (row) => row.version ?? "-" },
  { header: "login", value: (row) => (row.path === null ? "-" : row.login) },
  // Tier 1 means status, usage and recommendations; tier 2 means agn can launch it and little else.
  { header: "support", value: (row) => (row.tier === 1 ? "full" : "basic") },
  { header: "models", value: models },
  { header: "path", value: (row) => row.path ?? NOT_INSTALLED },
];

export function doctorCommand(ctx: CliContext): Command {
  return new Command("doctor")
    .description("detect installed agents, logins and models")
    .action(async () => {
      const client = await ctx.client();
      const response = await client.doctor();
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of renderTable(reported(response), COLUMNS)) {
        ctx.io.out(line);
      }
      for (const tool of response.tools) {
        ctx.io.out(toolLine(tool));
      }
      ctx.io.out(`profiles: ${response.profiles.length} available (agn profiles)`);
      ctx.io.out(`PATH: ${response.pathVar}`);
    });
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
