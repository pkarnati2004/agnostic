import { join } from "node:path";
import { readTextFile } from "@agnostic/core";
import { MCP_JSON } from "./mcp-claude.js";
import { OPENCODE_JSON, OPENCODE_JSONC } from "./mcp-opencode.js";
import type { McpExisting } from "./mcp-plan.js";

/** Codex's config is per user, not per repo, so it is read from the home the daemon runs under. */
export function codexConfigPath(home: string): string {
  return join(home, ".codex", "config.toml");
}

export async function readMcpExisting(repoPath: string, home: string): Promise<McpExisting> {
  const opencodeJson = await readTextFile(join(repoPath, OPENCODE_JSON));
  return {
    mcpJson: await readTextFile(join(repoPath, MCP_JSON)),
    opencodeJson,
    opencodeJsonc:
      opencodeJson === null && (await readTextFile(join(repoPath, OPENCODE_JSONC))) !== null,
    // A user with no Codex config yet gets one holding nothing but agn's block.
    codexToml: (await readTextFile(codexConfigPath(home))) ?? "",
  };
}
