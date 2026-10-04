import {
  AGN_TABLE_MARKER,
  type MarkedBlock,
  type McpServer,
  type McpValue,
  readTextFile,
  withMarkedBlock,
  withoutMarkedBlock,
} from "@agnostic/core";
import { SyncError } from "./error.js";
import type { McpSyntaxAdapter, McpSyntaxRow } from "./mcp-syntax.js";

/**
 * Codex keeps its MCP servers in the user's own config, so agn owns one marked block per repo:
 * a single shared block would let the second repo's sync erase the first repo's servers.
 */
function codexBlock(repoId: string): MarkedBlock {
  return {
    begin: `# >>> agn mcp for ${repoId}: managed block, edits here are replaced >>>`,
    end: `# <<< agn mcp for ${repoId} <<<`,
    refuse: (why) =>
      new SyncError(`agn will not edit this Codex config: ${why}`, {
        code: "mcp-codex-unwritable",
        hint: `Delete the agn mcp marker lines for ${repoId} in ~/.codex/config.toml, then run \`agn sync\` again.`,
      }),
  };
}

/**
 * Codex's config is the user's own file, so agn writes it whole from the block it owns: the servers
 * of `.ag/mcp.yaml` that have a form here, and nothing else. A server agn cannot express is left to
 * the user with a reason rather than written wrong.
 */
export const codexSyntax: McpSyntaxAdapter = {
  read: async (path) => ({ text: await readTextFile(path), blocked: null }),
  plan(existing, repoId, servers) {
    const current = existing.text ?? "";
    if (servers === null) {
      const cleared = withCodexTables(current, repoId, []);
      return { text: cleared === current ? null : cleared, rows: [] };
    }
    const planned = servers.map((server) => ({ server, table: codexTable(server) }));
    const tables = planned.flatMap((row) => ("table" in row.table ? [row.table.table] : []));
    const next = withCodexTables(current, repoId, tables);
    return {
      text: next === current ? null : next,
      rows: planned.map((row) => codexRow(row.server, row.table, current, repoId)),
    };
  },
};

function codexRow(
  server: McpServer,
  table: { table: CodexTable } | { skipped: string },
  current: string,
  repoId: string,
): McpSyntaxRow {
  if ("skipped" in table) {
    return { server: server.name, action: "skipped", reason: table.skipped };
  }
  const there = codexBlockBody(current, repoId).includes(table.table.text);
  return { server: server.name, action: there ? "unchanged" : "written", reason: null };
}

type CodexTable = { server: string; text: string };

/**
 * Codex forwards a variable only under its own name (`env_vars` is a list of names, not a map),
 * so an env key that renames the variable has no form here and the server is left to the user.
 */
function codexTable(server: McpServer): { table: CodexTable } | { skipped: string } {
  // The marker tells a later sync its own table from one `codex mcp add` appended into the block.
  const lines = [`[mcp_servers.${server.name}]`, AGN_TABLE_MARKER];
  if (server.kind === "stdio") {
    for (const [key, value] of Object.entries(server.env)) {
      if (value.kind === "env" && value.name !== key) {
        return { skipped: renameSkipped(key, value.name) };
      }
    }
    lines.push(`command = ${basicString(server.command)}`);
    push(lines, "args", server.args.length === 0 ? null : list(server.args));
    push(lines, "env", inlineTable(literals(server.env)));
    push(lines, "env_vars", variableNames(server.env));
  } else {
    lines.push(`url = ${basicString(server.url)}`);
    push(lines, "http_headers", inlineTable(literals(server.headers)));
    push(lines, "env_http_headers", inlineTable(variables(server.headers)));
  }
  return { table: { server: server.name, text: `${lines.join("\n")}\n` } };
}

/** The block this repo owns, rebuilt whole: an entry dropped from `.ag/mcp.yaml` leaves with it. */
function withCodexTables(text: string, repoId: string, tables: CodexTable[]): string {
  const block = codexBlock(repoId);
  assertNoStrayTables(withoutMarkedBlock(text, block), tables, repoId);
  return withMarkedBlock(text, block, tables.map((table) => table.text).join("\n"));
}

/** What this repo's block holds now, so a sync can tell an entry it would rewrite from one it wrote. */
function codexBlockBody(text: string, repoId: string): string {
  const block = codexBlock(repoId);
  const begin = text.indexOf(`${block.begin}\n`);
  const end = text.indexOf(`${block.end}\n`, begin);
  return begin === -1 || end === -1 ? "" : text.slice(begin + block.begin.length + 1, end);
}

/**
 * A table agn would write that already exists elsewhere in the file - another repo's block, or one
 * the user wrote - would be a duplicate table and make the config unparsable.
 */
function assertNoStrayTables(text: string, tables: CodexTable[], repoId: string): void {
  const stray = tables.find((table) => hasTable(text, table.server));
  if (stray !== undefined) {
    throw new SyncError(
      `${stray.server} is already a Codex MCP server outside agn's block for ${repoId}`,
      {
        code: "mcp-codex-duplicate",
        hint: "Rename it in .ag/mcp.yaml or remove the other table.",
      },
    );
  }
}

function hasTable(text: string, server: string): boolean {
  return text.split("\n").some((line) => line.trim() === `[mcp_servers.${server}]`);
}

function renameSkipped(key: string, name: string): string {
  return `Codex forwards a variable only under its own name; rename ${key} to ${name} or set it in ~/.codex/config.toml by hand`;
}

function push(lines: string[], key: string, value: string | null): void {
  if (value !== null) {
    lines.push(`${key} = ${value}`);
  }
}

function literals(values: Record<string, McpValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      value.kind === "literal" ? [[key, value.value]] : [],
    ),
  );
}

/** A `$NAME` header is a variable Codex reads at start; the header keeps its own name. */
function variables(values: Record<string, McpValue>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      value.kind === "env" ? [[key, value.name]] : [],
    ),
  );
}

function variableNames(values: Record<string, McpValue>): string | null {
  const names = Object.values(values).flatMap((value) =>
    value.kind === "env" ? [value.name] : [],
  );
  return names.length === 0 ? null : list(names);
}

function list(values: string[]): string {
  return `[${values.map(basicString).join(", ")}]`;
}

function inlineTable(values: Record<string, string>): string | null {
  const pairs = Object.entries(values).map(
    ([key, value]) => `${basicString(key)} = ${basicString(value)}`,
  );
  return pairs.length === 0 ? null : `{ ${pairs.join(", ")} }`;
}

/** A TOML basic string: a control character in one makes Codex reject the whole config. */
function basicString(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}
