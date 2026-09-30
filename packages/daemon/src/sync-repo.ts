import { homedir } from "node:os";
import {
  CoreError,
  type Repo,
  readAgText,
  readMcpConfig,
  type SyncRequest,
  type SyncResponse,
  type SyncWrite,
} from "@agnostic/core";
import {
  applySyncPlan,
  codexConfigPath,
  type McpExisting,
  type McpSyncPlan,
  planMcpSync,
  planSync,
  readMcpExisting,
  readSyncInputs,
  writeTextFile,
} from "@agnostic/sync";
import type { DaemonContext } from "./app.js";

/**
 * Everything one sync writes into `dir`: the two instruction files and the servers of
 * `.ag/mcp.yaml`. All or nothing across the lists, so one file written by hand leaves the whole
 * set as it was. Codex's config is the one target outside the repo, and it is written last.
 */
export async function syncRepo(
  ctx: DaemonContext,
  repo: Repo,
  dir: string,
  req: SyncRequest,
): Promise<SyncResponse> {
  const opts = { force: req.force === true };
  const config = await readMcpConfig(dir);
  const instructions = await planInstructions(dir, config !== null, opts);
  const home = ctx.env.HOME ?? homedir();
  const mcpExisting = await readMcpExisting(dir, home);
  // Thrown here, before anything is written: a duplicate Codex table, or a target agn cannot read.
  const mcp = planMcpSync({ config, repoId: repo.id, existing: mcpExisting });
  const writes = [...instructions, ...mcp.writes];
  if (req.dryRun === true) {
    return { writes, mcp: mcp.rows, applied: false };
  }
  await applySyncPlan(dir, writes);
  await writeCodexConfig(repo, home, mcpExisting, mcp);
  return { writes, mcp: mcp.rows, applied: true };
}

/** Codex's config is per user, so agn says out loud what it wrote outside the repo. */
async function writeCodexConfig(
  repo: Repo,
  home: string,
  existing: McpExisting,
  mcp: McpSyncPlan,
): Promise<void> {
  if (mcp.codex === null || mcp.codex.text === existing.codexToml) {
    return;
  }
  const file = codexConfigPath(home);
  await writeTextFile(file, mcp.codex.text);
  process.stderr.write(`agn wrote its MCP servers for ${repo.name} to ${file}\n`);
}

/**
 * A repo can carry `mcp.yaml` and no `instructions.md`; each part of `.ag/` generates on its own.
 * With neither, `readSyncInputs` says there is nothing to generate from.
 */
async function planInstructions(
  dir: string,
  hasMcp: boolean,
  opts: { force: boolean },
): Promise<SyncWrite[]> {
  if (hasMcp && (await readAgText(dir, "instructions.md")) === null) {
    return [];
  }
  return planSync(await readSyncInputs(dir), opts);
}

/**
 * What a launch calls for the directory the agent will run in. The source is that directory's own
 * committed `.ag/instructions.md` (ADR 013: from the commit, never the main checkout's working
 * tree), so a worktree cut from a base older than the last sync still gets the current text. A
 * repo without `.ag/` syncs nothing, and a file someone wrote by hand costs a line in the log
 * rather than the whole run.
 */
export async function ensureSynced(ctx: DaemonContext, repo: Repo, cwd: string): Promise<void> {
  try {
    if (!(await hasSyncSource(cwd))) {
      return;
    }
    await syncRepo(ctx, repo, cwd, {});
  } catch (cause) {
    ctx.log.warn("sync skipped", {
      cwd,
      code: cause instanceof CoreError ? cause.code : "unknown",
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

/** Either part of `.ag/` is reason enough to sync: the instructions, the MCP servers. */
async function hasSyncSource(dir: string): Promise<boolean> {
  return (await readAgText(dir, "instructions.md")) !== null || (await readMcpConfig(dir)) !== null;
}
