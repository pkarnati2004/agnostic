import { type McpServer, type McpValue, readTextFile } from "@agnostic/core";
import { type JsonEntries, planJson, readEntries, withEntries } from "./mcp-json.js";
import type { McpSyntaxAdapter } from "./mcp-syntax.js";

const KEY = "mcpServers";

/** The name a message gives this file; the path agn opens comes from the harness's registry row. */
const NAME = ".mcp.json";

/** Claude Code expands `${VAR}` itself, in an env value and in a header, when it starts a server. */
function claudeEntry(server: McpServer): Record<string, unknown> {
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

/** Claude Code's file is plain JSON agn merges its own entries into, and nothing stops a write. */
export const claudeSyntax: McpSyntaxAdapter = {
  read: async (path) => ({ text: await readTextFile(path), blocked: null }),
  plan: planJson({ entry: claudeEntry, entries: claudeServers, merged: withClaudeServers }),
};

/** The entries this file holds now, agn's and everyone else's. */
function claudeServers(existing: string | null): JsonEntries {
  return readEntries(NAME, existing, KEY);
}

function withClaudeServers(existing: string | null, servers: McpServer[]): string {
  const entries = Object.fromEntries(servers.map((server) => [server.name, claudeEntry(server)]));
  return withEntries(NAME, existing, KEY, entries, {});
}

function expanded(values: Record<string, McpValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value.kind === "literal" ? value.value : `\${${value.name}}`,
    ]),
  );
}
