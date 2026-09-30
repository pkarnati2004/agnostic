import { z } from "zod";

/** The two files `agn sync` generates from `.ag/instructions.md`, relative to the repo root. */
export type SyncTarget = "CLAUDE.md" | "AGENTS.md";

export type SyncAction = "create" | "update" | "unchanged" | "conflict";

/**
 * `content` is what sync would write, whatever the action; `reason` is set for some of them.
 * `file` is any path relative to the repo root: the two instruction files, and the MCP configs
 * `.mcp.json` and `opencode.json`.
 */
export type SyncWrite = {
  file: string;
  action: SyncAction;
  content: string;
  reason: string | null;
};

/** The three files `.ag/mcp.yaml` is compiled into, one per harness that reads MCP servers. */
export type McpTarget = "claude-code" | "opencode" | "codex";

/**
 * One server against one target. `written` covers create and update; `unchanged` is an entry
 * already there byte for byte; `reason` is set only for `skipped`.
 */
export type McpSyncRow = {
  server: string;
  target: McpTarget;
  action: "written" | "unchanged" | "skipped";
  reason: string | null;
};

export const SyncRequestSchema = z.strictObject({
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

/** `applied` is false after a dry run: the plan is the same, nothing on disk changed. */
export type SyncResponse = {
  writes: SyncWrite[];
  /** Codex's config is outside the repo, so its result is reported here and not in `writes`. */
  mcp: McpSyncRow[];
  applied: boolean;
};
