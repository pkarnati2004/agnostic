import type { Profile } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { type Column, renderTable, tableHeader } from "../table.js";

const COLUMNS: Column<Profile>[] = [
  { header: "id", value: (profile) => profile.id },
  { header: "billing", value: (profile) => profile.billing },
  { header: "support", value: (profile) => (profile.tier === 1 ? "full" : "basic") },
  { header: "evidence", value: (profile) => profile.evidence },
];

export function profilesCommand(ctx: CliContext): Command {
  return new Command("profiles")
    .description("list the agent and model combinations you can run now")
    .action(async () => {
      const client = await ctx.client();
      const response = await client.profiles();
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      // The daemon's order is the recommender's order, so it is kept rather than re-sorted here.
      const lines =
        response.profiles.length === 0
          ? [tableHeader(COLUMNS)]
          : renderTable(response.profiles, COLUMNS);
      for (const line of lines) {
        ctx.io.out(line);
      }
      ctx.io.out(`detected ${response.detectedAt}`);
    });
}
