import { readFile } from "node:fs/promises";
import { type McpServer, readMcpConfig } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { MCP_JSON, withClaudeServers } from "./mcp-claude.js";
import { mcpFixture } from "./test-repo.js";

let servers: McpServer[];

beforeAll(async () => {
  servers = (await readMcpConfig(mcpFixture("one-server")))?.servers ?? [];
});

function existing(): Promise<string> {
  return readFile(mcpFixture("existing", MCP_JSON), "utf8");
}

describe("withClaudeServers", () => {
  it("writes the fixture's servers byte for byte", async () => {
    const expected = await readFile(mcpFixture("one-server", "expected", MCP_JSON), "utf8");
    expect(withClaudeServers(null, servers)).toBe(expected);
  });

  it("expands a $NAME env value and header in Claude Code's own syntax", () => {
    const written = withClaudeServers(null, servers);
    expect(written).toContain(`"DATABASE_URL": "\${DATABASE_URL}"`);
    expect(written).toContain(`"Authorization": "\${MCP_AUTH}"`);
  });

  it("keeps a foreign entry, and every other key, where the file had them", async () => {
    const written = withClaudeServers(await existing(), servers);
    const parsed = JSON.parse(written) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed.mcpServers)).toEqual(["playwright", "db", "docs"]);
    expect(parsed.mcpServers.playwright).toEqual({
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });
  });

  it("is byte-identical the second time it runs", async () => {
    const once = withClaudeServers(await existing(), servers);
    expect(withClaudeServers(once, servers)).toBe(once);
  });

  it("keeps a foreign entry's nested objects and arrays byte for byte", () => {
    const other = {
      command: "other-mcp",
      args: ["--flag", "value"],
      env: { NESTED: { deep: { value: [1, 2, 3] } }, PLAIN: "x" },
    };
    const existingText = `${JSON.stringify({ mcpServers: { other } }, null, 2)}\n`;
    const written = withClaudeServers(existingText, servers);
    // Not just deep-equal: the same nested text agn never touched, unchanged in the output.
    expect(written).toContain(JSON.stringify(other, null, 2).replaceAll("\n", "\n    "));
    expect(
      (JSON.parse(written) as { mcpServers: Record<string, unknown> }).mcpServers.other,
    ).toEqual(other);
  });

  it("leaves an entry in place once .ag/mcp.yaml no longer names it, same as a foreign one", async () => {
    const both = withClaudeServers(await existing(), servers);
    const dbOnly = servers.filter((server) => server.name === "db");
    // ADR 036 pick 3: the two JSON files are the user's to prune; only the Codex block, which is
    // rebuilt whole every sync, drops an entry the moment .ag/mcp.yaml stops naming it.
    const resynced = withClaudeServers(both, dbOnly);
    const parsed = JSON.parse(resynced) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(parsed.mcpServers)).toEqual(["playwright", "db", "docs"]);
    expect(parsed.mcpServers.playwright).toEqual({
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });
  });

  it("refuses a file that is not a JSON object, naming it", () => {
    expect(() => withClaudeServers("[]", servers)).toThrow(
      expect.objectContaining({ code: "mcp-target-unreadable" }),
    );
    expect(() => withClaudeServers("{", servers)).toThrow(/\.mcp\.json/);
  });
});
