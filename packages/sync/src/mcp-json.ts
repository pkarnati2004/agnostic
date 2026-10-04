import type { McpServer } from "@agnostic/core";
import { SyncError } from "./error.js";
import type { McpSyntaxAdapter, McpSyntaxRow } from "./mcp-syntax.js";

/** One harness's MCP entries, by server name, exactly as its config file holds them. */
export type JsonEntries = Record<string, unknown>;

export function readEntries(file: string, text: string | null, key: string): JsonEntries {
  return text === null ? {} : entriesAt(file, parseObject(file, text)[key], key);
}

/**
 * agn owns the entries it names and nothing else: every other key of the file, and the order the
 * file keeps them in, survives the merge, because this is a file the user also writes in.
 */
export function withEntries(
  file: string,
  text: string | null,
  key: string,
  entries: JsonEntries,
  seed: JsonEntries,
): string {
  const root = text === null ? { ...seed } : parseObject(file, text);
  root[key] = { ...entriesAt(file, root[key], key), ...entries };
  return `${JSON.stringify(root, null, 2)}\n`;
}

function parseObject(file: string, text: string): JsonEntries {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw unreadable(file, "it is not valid JSON", cause);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw unreadable(file, "it does not hold a JSON object");
  }
  return parsed as JsonEntries;
}

function entriesAt(file: string, value: unknown, key: string): JsonEntries {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw unreadable(file, `its "${key}" is not a JSON object`);
  }
  return value as JsonEntries;
}

function unreadable(file: string, because: string, cause?: unknown): SyncError {
  return new SyncError(`agn cannot write its MCP servers into ${file}: ${because}`, {
    code: "mcp-target-unreadable",
    hint: `Fix ${file}, or move it aside and run \`agn sync\` again.`,
    ...(cause === undefined ? {} : { cause }),
  });
}

/** How one JSON MCP config reads its servers, writes them back, and shapes a single entry. */
export type JsonShape = {
  entry: (server: McpServer) => Record<string, unknown>;
  /** The entries the file holds now, agn's and everyone else's. */
  entries: (existing: string | null) => JsonEntries;
  /** The whole file with agn's entries merged into whatever else it holds. */
  merged: (existing: string | null, servers: McpServer[]) => string;
};

/**
 * The plan for a JSON MCP config: the file as it should be, and a verdict per server. Both JSON
 * targets differ only in `shape`, so this is the whole of their planning.
 */
export function planJson(shape: JsonShape): McpSyntaxAdapter["plan"] {
  return (existing, _repoId, servers) => {
    const blocked = existing.blocked;
    if (blocked !== null) {
      return { text: null, rows: (servers ?? []).map((server) => skipped(server.name, blocked)) };
    }
    if (servers === null) {
      return { text: null, rows: [] };
    }
    const entries = shape.entries(existing.text);
    // No entry to write is no write at all: a repo whose servers were all skipped keeps its file.
    const text = servers.length === 0 ? null : shape.merged(existing.text, servers);
    return { text, rows: servers.map((server) => verdict(server, entries, shape)) };
  };
}

function verdict(server: McpServer, entries: JsonEntries, shape: JsonShape): McpSyntaxRow {
  const there = JSON.stringify(entries[server.name]) === JSON.stringify(shape.entry(server));
  return { server: server.name, action: there ? "unchanged" : "written", reason: null };
}

function skipped(server: string, reason: string): McpSyntaxRow {
  return { server, action: "skipped", reason };
}
