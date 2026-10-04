import { readFile } from "node:fs/promises";
import { type McpServer, readMcpConfig } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { codexSyntax } from "./mcp-codex.js";
import { mcpFixture, planFor, textFor } from "./test-repo.js";

const REPO = "r7k2m4pqrs";

let servers: McpServer[];

beforeAll(async () => {
  servers = (await readMcpConfig(mcpFixture("one-server")))?.servers ?? [];
});

/** The config as this sync would leave it, or as it stands when the sync would not touch it. */
function toml(config: string, repoId: string, named: McpServer[]): string {
  return textFor(codexSyntax, config, repoId, named);
}

function stdio(env: Record<string, { kind: "env"; name: string }>): McpServer {
  return { name: "db", kind: "stdio", command: "npx", args: [], env };
}

const OTHER: McpServer = { name: "other", kind: "stdio", command: "other-mcp", args: [], env: {} };

describe("the Codex config plan", () => {
  it("writes the fixture's tables byte for byte", async () => {
    const expected = await readFile(mcpFixture("one-server", "expected", "config.toml"), "utf8");
    expect(toml("", REPO, servers)).toBe(expected);
  });

  it("skips a server whose env key renames the variable", () => {
    const planned = planFor(codexSyntax, "", REPO, [
      stdio({ DB_URL: { kind: "env", name: "DATABASE_URL" } }),
    ]);
    expect(planned.rows).toEqual([
      {
        server: "db",
        action: "skipped",
        reason:
          "Codex forwards a variable only under its own name; rename DB_URL to DATABASE_URL or set it in ~/.codex/config.toml by hand",
      },
    ]);
  });

  it("carries the repo id in both markers, so two repos' blocks coexist", () => {
    const first = toml("", REPO, servers);
    const both = toml(first, "qqqqqqqqqq", [OTHER]);
    expect(both).toContain(`# >>> agn mcp for ${REPO}: managed block`);
    expect(both).toContain("# >>> agn mcp for qqqqqqqqqq: managed block");
    expect(both.startsWith(first)).toBe(true);
  });

  it("leaves every byte outside its own block alone", async () => {
    const config = await readFile(mcpFixture("existing", ".codex", "config.toml"), "utf8");
    const written = toml(config, REPO, servers);
    expect(written.startsWith(config)).toBe(true);
    expect(written).toContain('[hooks.state."/Users/me/.agnostic/hooks/agn-status.sh"]');
    // Removing the block gives the file back exactly as it was.
    expect(toml(written, REPO, [])).toBe(config);
  });

  it("refuses a table of the same name outside the block", async () => {
    const config = await readFile(mcpFixture("existing", ".codex", "config.toml"), "utf8");
    expect(() => toml(config, REPO, [OTHER])).toThrow(
      expect.objectContaining({ code: "mcp-codex-duplicate" }),
    );
    // Another repo's block is outside this one, so the same name in both is refused too.
    const theirs = toml("", "qqqqqqqqqq", servers);
    expect(() => toml(theirs, REPO, servers)).toThrow(/already a Codex MCP server/);
  });

  it("keeps a server `codex mcp add` appended inside the block and drops one agn no longer names", () => {
    const first = toml("", REPO, servers);
    const end = `# <<< agn mcp for ${REPO} <<<`;
    // `codex mcp add` appends its table after the last `mcp_servers` table, which is in agn's block.
    const added = '[mcp_servers.extra]\ncommand = "extra-mcp"\n';
    const appended = first.replace(end, `${added}${end}`);
    // A sync after `docs` left `.ag/mcp.yaml`: the block holds `db` alone.
    const db = servers.filter((server) => server.name === "db");
    const written = toml(appended, REPO, db);
    expect(written).toContain(added);
    expect(written.indexOf(added)).toBeGreaterThan(written.indexOf(end));
    expect(written).not.toContain("[mcp_servers.docs]");
    // The next sync finds it outside the block and leaves it where it is.
    expect(toml(written, REPO, db)).toBe(written);
  });

  it("removes the block and the blank line it brought", () => {
    const config = 'model = "gpt-5"\n';
    expect(toml(toml(config, REPO, servers), REPO, [])).toBe(config);
  });
});
