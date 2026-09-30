import type { McpServer, McpValue } from "@agnostic/core";
import { type JsonEntries, readEntries, withEntries } from "./mcp-json.js";

export const OPENCODE_JSON = "opencode.json";

/** OpenCode reads a JSONC file too, and agn's JSON writer would drop the comments in it. */
export const OPENCODE_JSONC = "opencode.jsonc";

const KEY = "mcp";

const SEED = { $schema: "https://opencode.ai/config.json" };

/**
 * `enabled: true` on every entry: the server is agn's, so a repo that declares it gets it, and a
 * user who wants it off takes it out of `.ag/mcp.yaml`.
 */
export function opencodeEntry(server: McpServer): Record<string, unknown> {
  if (server.kind === "stdio") {
    return {
      type: "local",
      command: [server.command, ...server.args],
      ...(Object.keys(server.env).length === 0 ? {} : { environment: expanded(server.env) }),
      enabled: true,
    };
  }
  return {
    type: "remote",
    url: server.url,
    ...(Object.keys(server.headers).length === 0 ? {} : { headers: expanded(server.headers) }),
    enabled: true,
  };
}

export function opencodeServers(existing: string | null): JsonEntries {
  return readEntries(OPENCODE_JSON, existing, KEY);
}

export function withOpencodeServers(existing: string | null, servers: McpServer[]): string {
  const entries = Object.fromEntries(servers.map((server) => [server.name, opencodeEntry(server)]));
  return withEntries(OPENCODE_JSON, existing, KEY, entries, SEED);
}

/** OpenCode's own syntax for "read this from the environment when the server starts". */
function expanded(values: Record<string, McpValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value.kind === "literal" ? value.value : `{env:${value.name}}`,
    ]),
  );
}
