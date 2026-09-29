import { readFile } from "node:fs/promises";
import { type McpServer, readMcpConfig } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { type CodexTable, codexTable, withCodexTables } from "./mcp-codex.js";
import { mcpFixture } from "./test-repo.js";

const REPO = "r7k2m4pqrs";

let servers: McpServer[];

beforeAll(async () => {
  servers = (await readMcpConfig(mcpFixture("one-server")))?.servers ?? [];
});

function tables(): CodexTable[] {
  return servers.flatMap((server) => {
    const built = codexTable(server);
    return "table" in built ? [built.table] : [];
  });
}

function stdio(env: Record<string, { kind: "env"; name: string }>): McpServer {
  return { name: "db", kind: "stdio", command: "npx", args: [], env };
}

describe("codexTable", () => {
  it("writes the fixture's tables byte for byte", async () => {
    const expected = await readFile(mcpFixture("one-server", "expected", "config.toml"), "utf8");
    expect(withCodexTables("", REPO, tables())).toBe(expected);
  });

  it("skips a server whose env key renames the variable", () => {
    const built = codexTable(stdio({ DB_URL: { kind: "env", name: "DATABASE_URL" } }));
    expect(built).toEqual({
      skipped:
        "Codex forwards a variable only under its own name; rename DB_URL to DATABASE_URL or set it in ~/.codex/config.toml by hand",
    });
  });
});

describe("withCodexTables", () => {
  it("carries the repo id in both markers, so two repos' blocks coexist", () => {
    const first = withCodexTables("", REPO, tables());
    const both = withCodexTables(first, "qqqqqqqqqq", [
      { server: "other", text: '[mcp_servers.other]\ncommand = "other-mcp"\n' },
    ]);
    expect(both).toContain(`# >>> agn mcp for ${REPO}: managed block`);
    expect(both).toContain("# >>> agn mcp for qqqqqqqqqq: managed block");
    expect(both.startsWith(first)).toBe(true);
  });

  it("leaves every byte outside its own block alone", async () => {
    const config = await readFile(mcpFixture("existing", ".codex", "config.toml"), "utf8");
    const written = withCodexTables(config, REPO, tables());
    expect(written.startsWith(config)).toBe(true);
    expect(written).toContain('[hooks.state."/Users/me/.agnostic/hooks/agn-status.sh"]');
    // Removing the block gives the file back exactly as it was.
    expect(withCodexTables(written, REPO, [])).toBe(config);
  });

  it("refuses a table of the same name outside the block", async () => {
    const config = await readFile(mcpFixture("existing", ".codex", "config.toml"), "utf8");
    const other: CodexTable[] = [{ server: "other", text: "[mcp_servers.other]\n" }];
    expect(() => withCodexTables(config, REPO, other)).toThrow(
      expect.objectContaining({ code: "mcp-codex-duplicate" }),
    );
    // Another repo's block is outside this one, so the same name in both is refused too.
    const theirs = withCodexTables("", "qqqqqqqqqq", tables());
    expect(() => withCodexTables(theirs, REPO, tables())).toThrow(/already a Codex MCP server/);
  });

  it("removes the block and the blank line it brought", () => {
    const config = 'model = "gpt-5"\n';
    expect(withCodexTables(withCodexTables(config, REPO, tables()), REPO, [])).toBe(config);
  });
});
