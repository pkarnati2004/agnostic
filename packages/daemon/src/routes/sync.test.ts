import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InitResponse, Repo, SyncResponse } from "@agnostic/core";
import { GENERATED_HEADER } from "@agnostic/sync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

const INSTRUCTIONS = "# app\n\nRun `pnpm test` before you finish.\n";

let daemon: TestDaemon;

beforeEach(async () => {
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

async function repoWithClaudeMd(): Promise<Repo> {
  const repo = await daemon.addRepo();
  await writeFile(join(repo.path, "CLAUDE.md"), INSTRUCTIONS, "utf8");
  return repo;
}

function read(repo: Repo, file: string): Promise<string> {
  return readFile(join(repo.path, file), "utf8");
}

async function sync(repo: Repo, body?: unknown): Promise<SyncResponse> {
  const response = await post(`/repos/${repo.id}/sync`, body);
  expect(response.status).toBe(200);
  return (await response.json()) as SyncResponse;
}

describe("POST /repos/:id/init", () => {
  it("creates .ag/ and seeds instructions.md from CLAUDE.md", async () => {
    const repo = await repoWithClaudeMd();
    const response = await post(`/repos/${repo.id}/init`);
    expect(response.status).toBe(200);
    const { writes } = (await response.json()) as InitResponse;
    expect(writes.map((write) => `${write.action} ${write.file}`)).toEqual([
      "created .ag/agnostic.yaml",
      "created .ag/preferences.yaml",
      "created .ag/instructions.md",
      "created .ag/decisions.md",
      "created .ag/tasks/.gitkeep",
    ]);
    expect(writes[2]?.source).toBe("CLAUDE.md");
    expect(await read(repo, ".ag/instructions.md")).toBe(INSTRUCTIONS);
  });

  it("refuses to choose between two instructions files that differ", async () => {
    const repo = await repoWithClaudeMd();
    await writeFile(join(repo.path, "AGENTS.md"), "# app\n\nSomething else.\n", "utf8");
    const response = await post(`/repos/${repo.id}/init`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "init-ambiguous-source" } });
  });

  it("refuses a --from naming a file the repo does not have", async () => {
    const repo = await repoWithClaudeMd();
    const response = await post(`/repos/${repo.id}/init`, { from: "AGENTS.md" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "init-source-missing" } });
  });

  it("rejects a body with fields it does not know", async () => {
    const repo = await repoWithClaudeMd();
    const response = await post(`/repos/${repo.id}/init`, { froms: "CLAUDE.md" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("answers 404 for an unknown repo", async () => {
    const response = await post("/repos/qqqqqqqqqq/init");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "repo-not-found" } });
  });

  it("refuses to seed instructions.md from a file agn generated itself", async () => {
    const repo = await repoWithClaudeMd();
    await post(`/repos/${repo.id}/init`);
    await sync(repo);
    await rm(join(repo.path, ".ag"), { recursive: true });
    const response = await post(`/repos/${repo.id}/init`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "init-source-generated" } });
  });
});

describe("POST /repos/:id/sync", () => {
  it("plans without writing on a dry run", async () => {
    const repo = await repoWithClaudeMd();
    await post(`/repos/${repo.id}/init`);
    const body = await sync(repo, { dryRun: true });
    expect(body.applied).toBe(false);
    expect(body.writes.map((write) => write.action)).toEqual(["update", "create"]);
    expect(await read(repo, "CLAUDE.md")).toBe(INSTRUCTIONS);
  });

  it("writes both targets, then reports them unchanged", async () => {
    const repo = await repoWithClaudeMd();
    await post(`/repos/${repo.id}/init`);
    expect((await sync(repo)).applied).toBe(true);
    expect(await read(repo, "CLAUDE.md")).toBe(`${GENERATED_HEADER}\n\n@AGENTS.md\n`);
    expect(await read(repo, "AGENTS.md")).toBe(`${GENERATED_HEADER}\n\n${INSTRUCTIONS}`);
    const again = await sync(repo);
    expect(again.writes.map((write) => write.action)).toEqual(["unchanged", "unchanged"]);
  });

  it("rewrites a generated file that was edited under its header", async () => {
    const repo = await repoWithClaudeMd();
    await post(`/repos/${repo.id}/init`);
    await sync(repo);
    await writeFile(join(repo.path, "AGENTS.md"), `${GENERATED_HEADER}\n\nedited\n`, "utf8");
    expect((await sync(repo)).writes[1]?.action).toBe("update");
    expect(await read(repo, "AGENTS.md")).toBe(`${GENERATED_HEADER}\n\n${INSTRUCTIONS}`);
  });

  it("refuses a file whose header is gone, until --force", async () => {
    const repo = await repoWithClaudeMd();
    await post(`/repos/${repo.id}/init`);
    await sync(repo);
    await writeFile(join(repo.path, "AGENTS.md"), "my own words\n", "utf8");
    const refused = await post(`/repos/${repo.id}/sync`);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: { code: "sync-conflict", message: expect.stringContaining("AGENTS.md") },
    });
    expect((await sync(repo, { force: true })).applied).toBe(true);
    expect(await read(repo, "AGENTS.md")).toBe(`${GENERATED_HEADER}\n\n${INSTRUCTIONS}`);
  });

  it("has nothing to generate from in a repo with no .ag/", async () => {
    const repo = await daemon.addRepo();
    const response = await post(`/repos/${repo.id}/sync`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "instructions-missing" } });
  });

  it("rejects a body with fields it does not know", async () => {
    const repo = await repoWithClaudeMd();
    const response = await post(`/repos/${repo.id}/sync`, { dryrun: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("answers 404 for an unknown repo", async () => {
    const response = await post("/repos/qqqqqqqqqq/sync");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "repo-not-found" } });
  });
});
