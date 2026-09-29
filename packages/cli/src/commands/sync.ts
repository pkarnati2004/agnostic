import type { McpSyncRow, McpTarget, SyncWrite } from "@agnostic/core";
import { Command } from "commander";
import { type CliContext, writeJson } from "../context.js";
import { resolveRepo } from "../resolve-repo.js";

type SyncFlags = { repo?: string; dryRun?: boolean; force?: boolean };

const INDENT = "  ";

export function syncCommand(ctx: CliContext): Command {
  return new Command("sync")
    .description("generate CLAUDE.md, AGENTS.md and MCP servers from .ag/")
    .option("--repo <repo>", "repo id, prefix or path; defaults to the one you are in")
    .option("--dry-run", "print what would be written, and write nothing")
    .option("--force", "overwrite a generated file that was written by hand")
    .action(async (flags: SyncFlags) => {
      const { repoId } = await resolveRepo(ctx, flags.repo);
      const client = await ctx.client();
      const response = await client.syncRepo(repoId, {
        ...(flags.dryRun === true ? { dryRun: true } : {}),
        ...(flags.force === true ? { force: true } : {}),
      });
      if (ctx.json) {
        writeJson(ctx.io, response);
        return;
      }
      const lines = response.applied
        ? response.writes.map(applied)
        : response.writes.flatMap(planned);
      for (const line of [...lines, ...mcpLines(response.mcp)]) {
        ctx.io.out(line);
      }
    });
}

function applied(write: SyncWrite): string {
  if (write.action === "create") {
    return `wrote ${write.file}`;
  }
  if (write.action === "update") {
    return `updated ${write.file}${reason(write)}`;
  }
  // A conflict never reaches here: the daemon refuses the whole plan with a 409 instead.
  return `unchanged ${write.file}`;
}

/** A dry run shows the bytes as well as the verdict, so the header is visible before it lands. */
function planned(write: SyncWrite): string[] {
  if (write.action === "create") {
    return [`would write ${write.file}`, "", ...indented(write.content)];
  }
  if (write.action === "update") {
    return [`would update ${write.file}${reason(write)}`, "", ...indented(write.content)];
  }
  return [write.action === "unchanged" ? `unchanged ${write.file}` : conflict(write)];
}

function conflict(write: SyncWrite): string {
  return `conflict ${write.file}: ${write.reason ?? "written by hand"}`;
}

/** Where each server went. The Codex file is outside the repo, so it is named, not counted. */
const MCP_FILES: Record<McpTarget, string> = {
  "claude-code": ".mcp.json",
  opencode: "opencode.json",
  codex: "~/.codex/config.toml",
};

function mcpLines(rows: McpSyncRow[]): string[] {
  const servers = [...new Set(rows.map((row) => row.server))];
  return servers.map((server) =>
    mcpLine(
      server,
      rows.filter((row) => row.server === server),
    ),
  );
}

function mcpLine(server: string, rows: McpSyncRow[]): string {
  // Every target skipped is one reason - a value that looks like a secret - so it is said once.
  if (rows.every((row) => row.action === "skipped")) {
    return `mcp ${server}: skipped (${rows[0]?.reason ?? "no reason given"})`;
  }
  return `mcp ${server}: ${rows.map(mcpTarget).join(", ")}`;
}

function mcpTarget(row: McpSyncRow): string {
  return row.action === "skipped"
    ? `${row.target} skipped (${row.reason ?? "no reason given"})`
    : MCP_FILES[row.target];
}

function reason(write: SyncWrite): string {
  return write.reason === null ? "" : ` (${write.reason})`;
}

/** Two spaces, except on a blank line, which would otherwise carry trailing whitespace. */
function indented(content: string): string[] {
  return content
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => (line === "" ? "" : `${INDENT}${line}`));
}
