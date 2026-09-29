import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agPaths, type Repo, type SyncResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

const INSTRUCTIONS = "# app\n\nRun `pnpm test` before you finish.\n";

let daemon: TestDaemon;

beforeEach(async () => {
  // The Codex config is per user, so a sync that writes one says so on stderr.
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  daemon = await createTestDaemon();
});

afterEach(() => daemon.close());

async function post(path: string, body?: unknown): Promise<Response> {
  return daemon.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function read(repo: Repo, file: string): Promise<string> {
  return readFile(join(repo.path, file), "utf8");
}

async function sync(repo: Repo, body?: unknown): Promise<SyncResponse> {
  const response = await post(`/repos/${repo.id}/sync`, body);
  expect(response.status).toBe(200);
  return (await response.json()) as SyncResponse;
}

/** A repo `agn init` has run in, with `.ag/mcp.yaml` on top of it. */
async function repoWithClaudeMd(): Promise<Repo> {
  const repo = await daemon.addRepo();
  await writeFile(join(repo.path, "CLAUDE.md"), INSTRUCTIONS, "utf8");
  return repo;
}

const MCP_YAML = `servers:
  db:
    command: npx
    args: ["-y", "@acme/db-mcp"]
    env:
      DATABASE_URL: $DATABASE_URL
      LOG_LEVEL: info
  docs:
    url: https://mcp.example.com/docs
    headers:
      Authorization: $MCP_AUTH
`;

async function repoWithMcp(yaml = MCP_YAML): Promise<Repo> {
  const repo = await repoWithClaudeMd();
  await post(`/repos/${repo.id}/init`);
  await writeFile(agPaths(repo.path).mcpYaml, yaml, "utf8");
  return repo;
}

function codexConfig(): Promise<string> {
  return readFile(join(daemon.home, ".codex", "config.toml"), "utf8");
}

describe("POST /repos/:id/sync with MCP servers", () => {
  it("writes both JSON files and this repo's block in the user's Codex config", async () => {
    const repo = await repoWithMcp();
    const body = await sync(repo);
    expect(body.writes.slice(2).map((write) => `${write.action} ${write.file}`)).toEqual([
      "create .mcp.json",
      "create opencode.json",
    ]);
    expect(body.mcp).toHaveLength(6);
    expect(body.mcp.every((row) => row.action === "written")).toBe(true);
    expect(await read(repo, ".mcp.json")).toContain(`"DATABASE_URL": "\${DATABASE_URL}"`);
    expect(await read(repo, "opencode.json")).toContain('"{env:DATABASE_URL}"');
    expect(await codexConfig()).toContain(`# >>> agn mcp for ${repo.id}: managed block`);
    expect(await codexConfig()).toContain('env_vars = ["DATABASE_URL"]');
  });

  it("reports every target unchanged on a second sync", async () => {
    const repo = await repoWithMcp();
    await sync(repo);
    const before = await codexConfig();
    const again = await sync(repo);
    expect(again.mcp.every((row) => row.action === "unchanged")).toBe(true);
    expect(again.writes.slice(2).map((write) => write.action)).toEqual(["unchanged", "unchanged"]);
    expect(await codexConfig()).toBe(before);
  });

  it("writes nothing on a dry run, the Codex config included", async () => {
    const repo = await repoWithMcp();
    const body = await sync(repo, { dryRun: true });
    expect(body.mcp).toHaveLength(6);
    await expect(read(repo, ".mcp.json")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(codexConfig()).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never writes a literal that looks like a secret", async () => {
    const repo = await repoWithMcp(
      "servers:\n  issues:\n    command: gh-mcp\n    env:\n      GITHUB_TOKEN: ghp_0BcDeFgHiJkLmNoPqRsTuVwXyZ0123456789\n",
    );
    const body = await sync(repo);
    expect(body.mcp.map((row) => row.action)).toEqual(["skipped", "skipped", "skipped"]);
    expect(body.writes.map((write) => write.file)).toEqual(["CLAUDE.md", "AGENTS.md"]);
    await expect(read(repo, ".mcp.json")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses the whole sync when Codex already has a table of that name", async () => {
    const repo = await repoWithMcp();
    await mkdir(join(daemon.home, ".codex"), { recursive: true });
    await writeFile(
      join(daemon.home, ".codex", "config.toml"),
      '[mcp_servers.db]\ncommand = "mine"\n',
      "utf8",
    );
    const refused = await post(`/repos/${repo.id}/sync`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: "mcp-codex-duplicate" } });
    // Nothing was written: the instruction files are still the ones `agn init` left behind.
    expect(await read(repo, "CLAUDE.md")).toBe(INSTRUCTIONS);
    expect(await codexConfig()).toBe('[mcp_servers.db]\ncommand = "mine"\n');
  });

  it("refuses a second repo's sync when it names a Codex server the first repo already wrote", async () => {
    const repoA = await repoWithMcp("servers:\n  db:\n    command: npx\n");
    const first = await sync(repoA);
    expect(first.mcp.find((row) => row.target === "codex")?.action).toBe("written");
    const codexAfterA = await codexConfig();

    const repoB = await repoWithMcp("servers:\n  db:\n    command: other-mcp\n");
    const refused = await post(`/repos/${repoB.id}/sync`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: { code: "mcp-codex-duplicate" } });

    // Nothing was written to repo B: its instructions are still what `agn init` left, no
    // .mcp.json exists for it, and repo A's own Codex block is untouched by B's refused sync.
    expect(await read(repoB, "CLAUDE.md")).toBe(INSTRUCTIONS);
    await expect(read(repoB, ".mcp.json")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await codexConfig()).toBe(codexAfterA);
  });

  it("answers 400 for a target it cannot merge into", async () => {
    const repo = await repoWithMcp();
    await writeFile(join(repo.path, ".mcp.json"), "not json\n", "utf8");
    const refused = await post(`/repos/${repo.id}/sync`);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ error: { code: "mcp-target-unreadable" } });
  });

  it("writes the servers of a repo whose .ag/ has no instructions.md", async () => {
    const repo = await daemon.addRepo();
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(agPaths(repo.path).mcpYaml, MCP_YAML, "utf8");
    const body = await sync(repo);
    expect(body.writes.map((write) => write.file)).toEqual([".mcp.json", "opencode.json"]);
    expect(await read(repo, ".mcp.json")).toContain('"db"');
  });
});
