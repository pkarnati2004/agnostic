import { z } from "zod";
import type { HarnessId } from "./profile-id.js";

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

/** The config syntaxes agn writes MCP servers in; a harness's registry row names the one it reads. */
export type McpSyntax = "mcp-json" | "opencode-json" | "codex-toml";

/**
 * Where one harness reads its MCP servers. `file` is relative to the repo root, or to the user's
 * home when the scope is `user`.
 */
export type McpTargetFile = {
  harness: HarnessId;
  file: string;
  scope: "repo" | "user";
  syntax: McpSyntax;
};

/**
 * One server against one harness. `written` covers create and update; `unchanged` is an entry
 * already there byte for byte; `reason` is set only for `skipped`. `file` is the path to print,
 * with `~/` for a file under home, not a path anything opens.
 */
export type McpSyncRow = {
  server: string;
  target: HarnessId;
  file: string;
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
  /** A user-scope config is outside the repo, so its result is reported here and not in `writes`. */
  mcp: McpSyncRow[];
  applied: boolean;
};
