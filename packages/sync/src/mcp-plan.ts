import {
  looksLikeSecret,
  type McpConfig,
  type McpServer,
  type McpSyncRow,
  type McpValue,
  type SyncWrite,
} from "@agnostic/core";
import { claudeEntry, claudeServers, MCP_JSON, withClaudeServers } from "./mcp-claude.js";
import { codexBlockBody, codexTable, withCodexTables } from "./mcp-codex.js";
import type { JsonEntries } from "./mcp-json.js";
import {
  OPENCODE_JSON,
  OPENCODE_JSONC,
  opencodeEntry,
  opencodeServers,
  withOpencodeServers,
} from "./mcp-opencode.js";

export type McpExisting = {
  mcpJson: string | null;
  opencodeJson: string | null;
  /** An `opencode.jsonc` beside a missing `opencode.json`: the comments are the user's. */
  opencodeJsonc: boolean;
  codexToml: string;
};

export type McpSyncInputs = { config: McpConfig | null; repoId: string; existing: McpExisting };

/** `codex` is the whole config file as it should be, or null when this sync would not touch it. */
export type McpSyncPlan = {
  writes: SyncWrite[];
  codex: { text: string } | null;
  rows: McpSyncRow[];
};

const TARGETS = ["claude-code", "opencode", "codex"] as const;

const JSONC_SKIP = `${OPENCODE_JSONC} is JSONC, which agn does not edit; add the entries by hand`;

/**
 * What one sync makes of `.ag/mcp.yaml`. Secrets first: a value that looks like a credential is
 * never written to any of the three targets, and the other servers still go out.
 */
export function planMcpSync(inputs: McpSyncInputs): McpSyncPlan {
  const { config, repoId, existing } = inputs;
  if (config === null) {
    const cleared = withCodexTables(existing.codexToml, repoId, []);
    return {
      writes: [],
      rows: [],
      codex: cleared === existing.codexToml ? null : { text: cleared },
    };
  }
  const written = config.servers.filter((server) => secretIn(server) === null);
  const tables = written.flatMap((server) => {
    const table = codexTable(server);
    return "table" in table ? [table.table] : [];
  });
  return {
    writes: jsonWrites(written, existing),
    codex: { text: withCodexTables(existing.codexToml, repoId, tables) },
    rows: config.servers.flatMap((server) => serverRows(server, repoId, existing)),
  };
}

function serverRows(server: McpServer, repoId: string, existing: McpExisting): McpSyncRow[] {
  const secret = secretIn(server);
  if (secret !== null) {
    const reason = `${secret} looks like a secret; write $NAME and set NAME in your shell`;
    return TARGETS.map((target) => ({ server: server.name, target, action: "skipped", reason }));
  }
  return [
    entryRow(server.name, "claude-code", claudeServers(existing.mcpJson), claudeEntry(server)),
    opencodeRow(server, existing),
    codexRow(server, repoId, existing),
  ];
}

function opencodeRow(server: McpServer, existing: McpExisting): McpSyncRow {
  if (existing.opencodeJsonc) {
    return { server: server.name, target: "opencode", action: "skipped", reason: JSONC_SKIP };
  }
  const entries = opencodeServers(existing.opencodeJson);
  return entryRow(server.name, "opencode", entries, opencodeEntry(server));
}

function codexRow(server: McpServer, repoId: string, existing: McpExisting): McpSyncRow {
  const table = codexTable(server);
  if ("skipped" in table) {
    return { server: server.name, target: "codex", action: "skipped", reason: table.skipped };
  }
  const there = codexBlockBody(existing.codexToml, repoId).includes(table.table.text);
  return {
    server: server.name,
    target: "codex",
    action: there ? "unchanged" : "written",
    reason: null,
  };
}

function entryRow(
  server: string,
  target: McpSyncRow["target"],
  entries: JsonEntries,
  entry: Record<string, unknown>,
): McpSyncRow {
  const there = JSON.stringify(entries[server]) === JSON.stringify(entry);
  return { server, target, action: there ? "unchanged" : "written", reason: null };
}

/** No entry to write is no write at all: a repo whose servers were all skipped keeps its files. */
function jsonWrites(servers: McpServer[], existing: McpExisting): SyncWrite[] {
  if (servers.length === 0) {
    return [];
  }
  const writes = [
    jsonWrite(MCP_JSON, existing.mcpJson, withClaudeServers(existing.mcpJson, servers)),
  ];
  if (!existing.opencodeJsonc) {
    const content = withOpencodeServers(existing.opencodeJson, servers);
    writes.push(jsonWrite(OPENCODE_JSON, existing.opencodeJson, content));
  }
  return writes;
}

/** Never a conflict: agn owns the entries it names in these files and not the files themselves. */
function jsonWrite(file: string, existing: string | null, content: string): SyncWrite {
  if (existing === null) {
    return { file, action: "create", content, reason: null };
  }
  return {
    file,
    action: existing === content ? "unchanged" : "update",
    content,
    reason: null,
  };
}

/** The key or header whose literal value must not be copied into a config file, or null. */
function secretIn(server: McpServer): string | null {
  const values = server.kind === "stdio" ? server.env : server.headers;
  for (const [key, value] of Object.entries<McpValue>(values)) {
    if (value.kind === "literal" && looksLikeSecret(value.value)) {
      return key;
    }
  }
  return null;
}
