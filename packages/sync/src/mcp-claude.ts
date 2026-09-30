import type { McpServer, McpValue } from "@agnostic/core";
import { type JsonEntries, readEntries, withEntries } from "./mcp-json.js";

export const MCP_JSON = ".mcp.json";

const KEY = "mcpServers";

/** Claude Code expands `${VAR}` itself, in an env value and in a header, when it starts a server. */
export function claudeEntry(server: McpServer): Record<string, unknown> {
  if (server.kind === "stdio") {
    return {
      command: server.command,
      ...(server.args.length === 0 ? {} : { args: server.args }),
      ...(Object.keys(server.env).length === 0 ? {} : { env: expanded(server.env) }),
    };
  }
  // Streamable HTTP only: `sse` is the older transport and nothing in `.ag/mcp.yaml` asks for it.
  return {
    type: "http",
    url: server.url,
    ...(Object.keys(server.headers).length === 0 ? {} : { headers: expanded(server.headers) }),
  };
}

/** The entries the repo's `.mcp.json` holds now, agn's and everyone else's. */
export function claudeServers(existing: string | null): JsonEntries {
  return readEntries(MCP_JSON, existing, KEY);
}

export function withClaudeServers(existing: string | null, servers: McpServer[]): string {
  const entries = Object.fromEntries(servers.map((server) => [server.name, claudeEntry(server)]));
  return withEntries(MCP_JSON, existing, KEY, entries, {});
}

function expanded(values: Record<string, McpValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value.kind === "literal" ? value.value : `\${${value.name}}`,
    ]),
  );
}
