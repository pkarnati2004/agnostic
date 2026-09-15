import type { Repo } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { type Column, renderTable } from "../table.js";

const COLUMNS: Column<Repo>[] = [
  { header: "id", value: (repo) => repo.id },
  { header: "name", value: (repo) => repo.name },
  { header: "kind", value: (repo) => repo.kind },
  { header: "path", value: (repo) => repo.path },
];

// Status only says something once closed repos are in the list, so it is the flag's column.
const STATUS: Column<Repo> = { header: "status", value: (repo) => repo.status };

type ReposFlags = { all?: boolean };

export function reposCommand(ctx: CliContext): Command {
  return new Command("repos")
    .description("list the registered repos")
    .option("--all", "include closed repos")
    .action(async (flags: ReposFlags) => {
      const client = await ctx.client();
      const all = flags.all === true;
      const response = await client.listRepos({ all });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      if (response.repos.length === 0) {
        ctx.io.out("no repos yet; run agn add <path>");
        return;
      }
      const sorted = [...response.repos].sort((a, b) => a.name.localeCompare(b.name));
      for (const line of renderTable(sorted, all ? [...COLUMNS, STATUS] : COLUMNS)) {
        ctx.io.out(line);
      }
    });
}
