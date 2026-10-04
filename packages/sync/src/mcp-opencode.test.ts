import { readFile } from "node:fs/promises";
import { type McpServer, readMcpConfig } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { opencodeSyntax } from "./mcp-opencode.js";
import { mcpFixture, textFor } from "./test-repo.js";

const OPENCODE_JSON = "opencode.json";

const REPO = "r7k2m4pqrs";

let servers: McpServer[];

beforeAll(async () => {
  servers = (await readMcpConfig(mcpFixture("one-server")))?.servers ?? [];
});

function merged(existing: string | null, servers: McpServer[]): string {
  return textFor(opencodeSyntax, existing, REPO, servers);
}

function existing(): Promise<string> {
  return readFile(mcpFixture("existing", OPENCODE_JSON), "utf8");
}

describe("the opencode.json plan", () => {
  it("writes the fixture's servers byte for byte", async () => {
    const expected = await readFile(mcpFixture("one-server", "expected", OPENCODE_JSON), "utf8");
    expect(merged(null, servers)).toBe(expected);
  });

  it("expands a $NAME env value and header in OpenCode's own syntax", () => {
    const written = merged(null, servers);
    expect(written).toContain('"DATABASE_URL": "{env:DATABASE_URL}"');
    expect(written).toContain('"Authorization": "{env:MCP_AUTH}"');
  });

  it("names the schema only in a file it creates", async () => {
    expect(merged(null, servers)).toContain('"$schema"');
    const written = merged('{\n  "mcp": {}\n}\n', servers);
    expect(written).not.toContain("$schema");
  });

  it("keeps a foreign entry, and every other key, where the file had them", async () => {
    const written = merged(await existing(), servers);
    const parsed = JSON.parse(written) as { mcp: Record<string, unknown>; theme: string };
    expect(Object.keys(parsed)).toEqual(["$schema", "theme", "mcp"]);
    expect(parsed.theme).toBe("system");
    expect(Object.keys(parsed.mcp)).toEqual(["playwright", "db", "docs"]);
  });

  it("is byte-identical the second time it runs", async () => {
    const once = merged(await existing(), servers);
    expect(merged(once, servers)).toBe(once);
  });

  it("keeps a foreign entry's nested objects and arrays byte for byte", () => {
    const other = {
      type: "local",
      command: ["other-mcp", "--flag"],
      environment: { NESTED: { deep: { value: [1, 2, 3] } }, PLAIN: "x" },
      enabled: false,
    };
    const existingText = `${JSON.stringify({ mcp: { other } }, null, 2)}\n`;
    const written = merged(existingText, servers);
    expect(written).toContain(JSON.stringify(other, null, 2).replaceAll("\n", "\n    "));
    expect((JSON.parse(written) as { mcp: Record<string, unknown> }).mcp.other).toEqual(other);
  });

  it("leaves an entry in place once .ag/mcp.yaml no longer names it, same as a foreign one", async () => {
    const both = merged(await existing(), servers);
    const dbOnly = servers.filter((server) => server.name === "db");
    // ADR 036 pick 3: the two JSON files are the user's to prune; only the Codex block, which is
    // rebuilt whole every sync, drops an entry the moment .ag/mcp.yaml stops naming it.
    const resynced = merged(both, dbOnly);
    const parsed = JSON.parse(resynced) as { mcp: Record<string, unknown> };
    expect(Object.keys(parsed.mcp)).toEqual(["playwright", "db", "docs"]);
  });

  it("refuses a file that is not a JSON object, naming it", () => {
    expect(() => merged('"text"', servers)).toThrow(
      expect.objectContaining({ code: "mcp-target-unreadable" }),
    );
    expect(() => merged('{"mcp": []}', servers)).toThrow(/opencode\.json/);
  });
});
