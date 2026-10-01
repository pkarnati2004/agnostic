import { join } from "node:path";
import type { HarnessId, McpTargetFile } from "@agnostic/core";
import { type McpExistingTarget, mcpSyntaxes } from "./mcp-syntax.js";

export type McpExisting = Map<HarnessId, McpExistingTarget>;

/**
 * Every MCP config the targets name, as it stands now. A repo-scope file sits in the repo; a
 * user-scope one is read from the home the daemon runs under, because it is per user and not
 * per repo.
 */
export async function readMcpExisting(
  targets: McpTargetFile[],
  repoPath: string,
  home: string,
): Promise<McpExisting> {
  const existing: McpExisting = new Map();
  for (const target of targets) {
    const inRepo = target.scope === "repo";
    const path = join(inRepo ? repoPath : home, target.file);
    const read = await mcpSyntaxes[target.syntax].read(path);
    existing.set(target.harness, {
      ...read,
      path,
      file: inRepo ? target.file : `~/${target.file}`,
    });
  }
  return existing;
}
