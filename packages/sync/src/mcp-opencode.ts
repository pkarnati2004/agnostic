import { type McpServer, type McpValue, readTextFile } from "@agnostic/core";
import { type JsonEntries, planJson, readEntries, withEntries } from "./mcp-json.js";
import type { McpSyntaxAdapter } from "./mcp-syntax.js";

const KEY = "mcp";

/** The name a message gives this file; the path agn opens comes from the harness's registry row. */
const NAME = "opencode.json";

const SEED = { $schema: "https://opencode.ai/config.json" };

/**
 * `enabled: true` on every entry: the server is agn's, so a repo that declares it gets it, and a
 * user who wants it off takes it out of `.ag/mcp.yaml`.
 */
function opencodeEntry(server: McpServer): Record<string, unknown> {
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

/**
 * OpenCode reads a JSONC file too, and agn's JSON writer would drop the comments in it, so a
 * `.jsonc` beside a missing `.json` blocks the write and the user is told to add the entries.
 */
export const opencodeSyntax: McpSyntaxAdapter = {
  async read(path) {
    const text = await readTextFile(path);
    const jsonc = path.replace(/\.json$/, ".jsonc");
    const comments = text === null && (await readTextFile(jsonc)) !== null;
    return { text, blocked: comments ? jsoncSkip(jsonc) : null };
  },
  plan: planJson({ entry: opencodeEntry, entries: opencodeServers, merged: withOpencodeServers }),
};

function opencodeServers(existing: string | null): JsonEntries {
  return readEntries(NAME, existing, KEY);
}

function withOpencodeServers(existing: string | null, servers: McpServer[]): string {
  const entries = Object.fromEntries(servers.map((server) => [server.name, opencodeEntry(server)]));
  return withEntries(NAME, existing, KEY, entries, SEED);
}

function jsoncSkip(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return `${name} is JSONC, which agn does not edit; add the entries by hand`;
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
