import type {
  CatalogRowsResponse,
  CatalogShowRow,
  CatalogSummary,
  CatalogUpdate,
} from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { type Column, renderTable } from "../table.js";

const UPGRADE_HINT = "npm i -g agnostic-dev@latest";

const COLUMNS: Column<CatalogShowRow>[] = [
  { header: "source", value: (row) => row.source },
  { header: "benchmark", value: (row) => row.benchmark },
  { header: "class", value: (row) => row.taskClass },
  // A row that names no harness measured the model alone, which is weaker evidence.
  { header: "harness", value: (row) => row.harness ?? "-" },
  { header: "metric", value: (row) => row.metric },
  { header: "score", value: (row) => String(row.score), align: "right" },
  { header: "date", value: (row) => row.date },
  { header: "weight", value: (row) => row.weight.toFixed(2), align: "right" },
  { header: "", value: (row) => (row.cited ? "*" : "") },
];

/**
 * The catalog is the evidence a recommendation rests on, so `show` prints the rows themselves
 * rather than a summary of them. `update` is the one command in agn that reaches off the machine.
 */
export function catalogCommand(ctx: CliContext): Command {
  const catalog = new Command("catalog").description("the benchmark data behind a recommendation");
  catalog
    .command("show")
    .argument("<profile>", "a profile id, as `agn profiles` prints it")
    .description("print the catalog rows behind a profile")
    .action(async (profile: string) => {
      const client = await ctx.client();
      const response = await client.catalogRows(profile);
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      for (const line of showLines(response)) {
        ctx.io.out(line);
      }
    });
  catalog
    .command("update")
    .description("fetch the latest published catalog")
    .action(async () => {
      const client = await ctx.client();
      const response = await client.catalogUpdate();
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      report(ctx, response.update);
    });
  return catalog;
}

function showLines(response: CatalogRowsResponse): string[] {
  const header = summaryLine(response.catalog);
  if (response.rows.length === 0) {
    return [header, `no rows for ${response.profileId}`];
  }
  const footer =
    response.cited === null
      ? []
      : [`* cited by the last recommendation (${response.cited.evidence} evidence)`];
  return [header, ...renderTable(response.rows, COLUMNS), ...footer];
}

function summaryLine(catalog: CatalogSummary): string {
  const checked =
    catalog.lastCheck === null ? "never checked" : `checked ${catalog.lastCheck.checkedAt}`;
  const check = `daily check ${catalog.checkEnabled ? "on" : "off"}`;
  return `catalog ${catalog.version} (${catalog.origin}, generated ${day(catalog.generatedAt)}; ${checked}; ${check})`;
}

/** One line, the same on a terminal and in a pipe; the exit code carries the rest (ADR 012). */
function report(ctx: CliContext, update: CatalogUpdate): void {
  if (update.outcome === "updated") {
    const rows = update.benchmarkRows ?? 0;
    ctx.io.out(
      `catalog updated ${update.localVersion} → ${update.remoteVersion} (generated ${day(update.generatedAt)}, ${rows} benchmark ${rows === 1 ? "row" : "rows"})`,
    );
    return;
  }
  if (update.outcome === "current") {
    ctx.io.out(`catalog ${update.remoteVersion} is current (generated ${day(update.generatedAt)})`);
    return;
  }
  ctx.io.err(
    `catalog ${update.remoteVersion} needs a newer agn: it uses schema ${update.remoteSchemaVersion} and this agn reads schema ${update.localSchemaVersion}`,
  );
  ctx.io.err(`  hint: ${UPGRADE_HINT}`);
  ctx.exitCode = 1;
}

/** The catalog is generated once a week; the time of day is noise in a one-line answer. */
function day(timestamp: string): string {
  return timestamp.slice(0, 10);
}
