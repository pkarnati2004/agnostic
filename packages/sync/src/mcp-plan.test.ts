import { readFile } from "node:fs/promises";
import { type McpConfig, readMcpConfig } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { withClaudeServers } from "./mcp-claude.js";
import { withCodexTables } from "./mcp-codex.js";
import { type McpExisting, planMcpSync } from "./mcp-plan.js";
import { mcpFixture } from "./test-repo.js";

const REPO = "r7k2m4pqrs";

const EMPTY: McpExisting = {
  mcpJson: null,
  opencodeJson: null,
  opencodeJsonc: false,
  codexToml: "",
};

let config: McpConfig;
let secret: McpConfig;

beforeAll(async () => {
  config = (await readMcpConfig(mcpFixture("one-server"))) as McpConfig;
  secret = (await readMcpConfig(mcpFixture("secret"))) as McpConfig;
});

function plan(over: Partial<McpExisting> = {}, from = (): McpConfig => config) {
  return planMcpSync({ config: from(), repoId: REPO, existing: { ...EMPTY, ...over } });
}

function rowsFor(server: string, plan: ReturnType<typeof planMcpSync>): string[] {
  return plan.rows
    .filter((row) => row.server === server)
    .map((row) => `${row.target} ${row.action}`);
}

describe("planMcpSync", () => {
  it("writes both JSON files and the Codex block for a fresh repo", () => {
    const planned = plan();
    expect(planned.writes.map((write) => `${write.action} ${write.file}`)).toEqual([
      "create .mcp.json",
      "create opencode.json",
    ]);
    expect(planned.rows).toHaveLength(6);
    expect(rowsFor("db", planned)).toEqual([
      "claude-code written",
      "opencode written",
      "codex written",
    ]);
    expect(planned.codex?.text).toContain("[mcp_servers.db]");
  });

  it("skips a server whose literal looks like a secret, and writes the others", () => {
    const planned = plan({}, () => secret);
    expect(rowsFor("issues", planned)).toEqual([
      "claude-code skipped",
      "opencode skipped",
      "codex skipped",
    ]);
    expect(planned.rows.filter((row) => row.server === "issues")[0]?.reason).toBe(
      "GITHUB_TOKEN looks like a secret; write $NAME and set NAME in your shell",
    );
    expect(rowsFor("db", planned)).toEqual([
      "claude-code written",
      "opencode written",
      "codex written",
    ]);
    const written = [...planned.writes.map((write) => write.content), planned.codex?.text ?? ""];
    expect(written.some((text) => text.includes("ghp_"))).toBe(false);
  });

  it("leaves a JSONC opencode config to the user and writes the other two targets", () => {
    const planned = plan({ opencodeJsonc: true });
    expect(planned.writes.map((write) => write.file)).toEqual([".mcp.json"]);
    expect(rowsFor("docs", planned)).toEqual([
      "claude-code written",
      "opencode skipped",
      "codex written",
    ]);
    expect(planned.rows.find((row) => row.target === "opencode")?.reason).toContain(
      "opencode.jsonc is JSONC",
    );
  });

  it("reports every target unchanged when the files already hold this sync's entries", () => {
    const first = plan();
    const again = plan({
      mcpJson: first.writes[0]?.content ?? null,
      opencodeJson: first.writes[1]?.content ?? null,
      codexToml: first.codex?.text ?? "",
    });
    expect(again.writes.map((write) => write.action)).toEqual(["unchanged", "unchanged"]);
    expect(again.rows.every((row) => row.action === "unchanged")).toBe(true);
  });

  it("updates a target that holds someone else's entries", async () => {
    const existing = await readFile(mcpFixture("existing", ".mcp.json"), "utf8");
    const planned = plan({ mcpJson: existing });
    expect(planned.writes[0]).toMatchObject({ file: ".mcp.json", action: "update" });
    expect(planned.writes[0]?.content).toContain("playwright");
  });

  it("takes the block out of the Codex config for a repo that no longer declares servers", () => {
    const codexToml = withCodexTables('model = "gpt-5"\n', REPO, [
      { server: "db", text: "[mcp_servers.db]\n" },
    ]);
    const planned = planMcpSync({ config: null, repoId: REPO, existing: { ...EMPTY, codexToml } });
    expect(planned.writes).toEqual([]);
    expect(planned.rows).toEqual([]);
    expect(planned.codex).toEqual({ text: 'model = "gpt-5"\n' });
  });

  it("has nothing to do for a repo that never had a block", () => {
    const planned = planMcpSync({ config: null, repoId: REPO, existing: EMPTY });
    expect(planned.codex).toBeNull();
  });

  it("removes this repo's Codex block when its one server skips Codex, though the JSON targets still get it", () => {
    const priorCodex = withCodexTables("", REPO, [{ server: "db", text: "[mcp_servers.db]\n" }]);
    // DB_URL renames the variable DATABASE_URL is under, which Codex forwards only under its own
    // name: codexTable skips it, so this sync's one server writes to no Codex table at all.
    const renamed: McpConfig = {
      servers: [
        {
          name: "db",
          kind: "stdio",
          command: "npx",
          args: [],
          env: { DB_URL: { kind: "env", name: "DATABASE_URL" } },
        },
      ],
    };
    const planned = planMcpSync({
      config: renamed,
      repoId: REPO,
      existing: { ...EMPTY, codexToml: priorCodex },
    });
    expect(planned.codex?.text).toBe("");
    expect(rowsFor("db", planned)).toEqual([
      "claude-code written",
      "opencode written",
      "codex skipped",
    ]);
    expect(planned.rows.find((row) => row.target === "codex")?.reason).toContain(
      "rename DB_URL to DATABASE_URL",
    );
    expect(planned.writes.map((write) => write.file)).toEqual([".mcp.json", "opencode.json"]);
  });

  it("leaves the two JSON files alone when every server was skipped", () => {
    const onlySecret: McpConfig = { servers: secret.servers.filter((s) => s.name === "issues") };
    const planned = plan({ mcpJson: withClaudeServers(null, config.servers) }, () => onlySecret);
    expect(planned.writes).toEqual([]);
    expect(planned.codex?.text).toBe("");
  });
});
