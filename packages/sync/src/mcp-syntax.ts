import type { McpServer, McpSyncRow, McpSyntax } from "@agnostic/core";
import { claudeSyntax } from "./mcp-claude.js";
import { codexSyntax } from "./mcp-codex.js";
import { opencodeSyntax } from "./mcp-opencode.js";

/** A target's file as it stands. `blocked` says why agn cannot write this file at all, or null. */
export type McpExistingFile = { text: string | null; blocked: string | null };

/** That file with the two paths the plan needs: the one agn opens, and the one agn prints. */
export type McpExistingTarget = McpExistingFile & {
  /** Absolute: the file agn read and would write. */
  path: string;
  /** What `agn sync` prints: relative to the repo, or written with `~/`. */
  file: string;
};

/** One server's verdict against one file; the plan adds the harness and the path to print. */
export type McpSyntaxRow = Pick<McpSyncRow, "server" | "action" | "reason">;

/**
 * How one config syntax reads its file and what it would write into it. A harness joins MCP sync by
 * naming a syntax on its registry row, so the three here are the whole set the plan dispatches on.
 */
export type McpSyntaxAdapter = {
  read(path: string): Promise<McpExistingFile>;
  /**
   * `servers` holds the non-secret servers of `.ag/mcp.yaml`, or null when that file is gone. A null
   * `text` is nothing to write, which is not the same as writing an empty file.
   */
  plan(
    existing: McpExistingTarget,
    repoId: string,
    servers: McpServer[] | null,
  ): { text: string | null; rows: McpSyntaxRow[] };
};

export const mcpSyntaxes: Record<McpSyntax, McpSyntaxAdapter> = {
  "mcp-json": claudeSyntax,
  "opencode-json": opencodeSyntax,
  "codex-toml": codexSyntax,
};
