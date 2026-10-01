import { readFile } from "node:fs/promises";
import { type McpConfig, type McpTargetFile, readMcpConfig } from "@agnostic/core";
import { beforeAll, describe, expect, it } from "vitest";
import { codexSyntax } from "./mcp-codex.js";
import type { McpExisting } from "./mcp-files.js";
import { planMcpSync } from "./mcp-plan.js";
import type { McpExistingTarget } from "./mcp-syntax.js";
import { mcpFixture, textFor } from "./test-repo.js";

const REPO = "r7k2m4pqrs";

/** What the registry rows inject: two files in the repo and one under the user's home. */
const TARGETS: McpTargetFile[] = [
  { harness: "claude-code", file: ".mcp.json", scope: "repo", syntax: "mcp-json" },
  { harness: "opencode", file: "opencode.json", scope: "repo", syntax: "opencode-json" },
  { harness: "codex", file: ".codex/config.toml", scope: "user", syntax: "codex-toml" },
];

let config: McpConfig;
let secret: McpConfig;

beforeAll(async () => {
  config = (await readMcpConfig(mcpFixture("one-server"))) as McpConfig;
  secret = (await readMcpConfig(mcpFixture("secret"))) as McpConfig;
});

type Over = Partial<Record<string, Partial<McpExistingTarget>>>;

function existing(over: Over = {}, targets = TARGETS): McpExisting {
  const read: McpExisting = new Map();
  for (const target of targets) {
    read.set(target.harness, {
      path: target.scope === "repo" ? `/repo/${target.file}` : `/home/${target.file}`,
      file: target.scope === "repo" ? target.file : `~/${target.file}`,
      text: null,
      blocked: null,
      ...over[target.harness],
    });
  }
  return read;
}

function plan(over: Over = {}, from = (): McpConfig | null => config, targets = TARGETS) {
  return planMcpSync({ config: from(), repoId: REPO, targets, existing: existing(over, targets) });
}

function rowsFor(server: string, planned: ReturnType<typeof planMcpSync>): string[] {
  return planned.rows
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
    expect(planned.userWrites).toHaveLength(1);
    expect(planned.userWrites[0]).toMatchObject({
      harness: "codex",
      file: "/home/.codex/config.toml",
    });
    expect(planned.userWrites[0]?.text).toContain("[mcp_servers.db]");
  });

  it("names each target's file the way agn prints it, with `~/` outside the repo", () => {
    const planned = plan();
    expect([...new Set(planned.rows.map((row) => row.file))]).toEqual([
      ".mcp.json",
      "opencode.json",
      "~/.codex/config.toml",
    ]);
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
    const written = [
      ...planned.writes.map((write) => write.content),
      ...planned.userWrites.map((write) => write.text),
    ];
    expect(written.some((text) => text.includes("ghp_"))).toBe(false);
  });

  it("leaves a JSONC opencode config to the user and writes the other two targets", () => {
    const planned = plan({ opencode: { blocked: "opencode.jsonc is JSONC" } });
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
      "claude-code": { text: first.writes[0]?.content ?? null },
      opencode: { text: first.writes[1]?.content ?? null },
      codex: { text: first.userWrites[0]?.text ?? null },
    });
    expect(again.writes.map((write) => write.action)).toEqual(["unchanged", "unchanged"]);
    expect(again.userWrites).toEqual([]);
    expect(again.rows.every((row) => row.action === "unchanged")).toBe(true);
  });

  it("updates a target that holds someone else's entries", async () => {
    const text = await readFile(mcpFixture("existing", ".mcp.json"), "utf8");
    const planned = plan({ "claude-code": { text } });
    expect(planned.writes[0]).toMatchObject({ file: ".mcp.json", action: "update" });
    expect(planned.writes[0]?.content).toContain("playwright");
  });

  it("gives a fourth target of a syntax it already knows its own write and its own row", () => {
    const targets: McpTargetFile[] = [
      ...TARGETS,
      { harness: "other-agent", file: ".config/other/mcp.json", scope: "user", syntax: "mcp-json" },
    ];
    const planned = plan({}, () => config, targets);
    expect(rowsFor("db", planned)).toEqual([
      "claude-code written",
      "opencode written",
      "codex written",
      "other-agent written",
    ]);
    expect(planned.userWrites.map((write) => write.harness)).toEqual(["codex", "other-agent"]);
    expect(planned.writes.map((write) => write.file)).toEqual([".mcp.json", "opencode.json"]);
  });

  it("takes the block out of the Codex config for a repo that no longer declares servers", () => {
    const text = textFor(codexSyntax, 'model = "gpt-5"\n', REPO, config.servers);
    const planned = plan({ codex: { text } }, () => null);
    expect(planned.writes).toEqual([]);
    expect(planned.rows).toEqual([]);
    expect(planned.userWrites).toEqual([
      { harness: "codex", file: "/home/.codex/config.toml", text: 'model = "gpt-5"\n' },
    ]);
  });

  it("has nothing to do for a repo that never had a block", () => {
    const planned = plan({}, () => null);
    expect(planned.userWrites).toEqual([]);
    expect(planned.writes).toEqual([]);
  });

  it("clears this repo's Codex block when its one server skips Codex, and still writes the JSON", () => {
    const prior = textFor(codexSyntax, "", REPO, config.servers);
    // DB_URL renames the variable DATABASE_URL is under, which Codex forwards only under its own
    // name: the Codex adapter skips it, so this sync writes no Codex table at all.
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
    const planned = plan({ codex: { text: prior } }, () => renamed);
    expect(planned.userWrites[0]?.text).toBe("");
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
    const text = textFor(codexSyntax, null, REPO, config.servers);
    const planned = plan({ codex: { text } }, () => onlySecret);
    expect(planned.writes).toEqual([]);
    expect(planned.userWrites[0]?.text).toBe("");
  });
});
