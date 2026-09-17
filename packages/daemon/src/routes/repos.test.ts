import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RegisterRepoResponse,
  RepoListResponse,
  RepoResponse,
  TaskStatus,
} from "@agnostic/core";
import { defaultRepoConfig, newId, run, writeRepoConfig } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;
let workspace: string;

beforeEach(async () => {
  daemon = await createTestDaemon();
  workspace = await realpath(await mkdtemp(join(tmpdir(), "agn-repos-")));
});

afterEach(async () => {
  await daemon.close();
  await rm(workspace, { recursive: true, force: true });
});

function post(body: unknown): Promise<Response> {
  return daemon.request("/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function register(name: string): Promise<string> {
  return ((await (await post({ path: await gitRepo(name) })).json()) as RegisterRepoResponse).repo
    .id;
}

function seedTask(repoId: string, status: TaskStatus): string {
  const now = new Date().toISOString();
  const id = newId();
  daemon.ledger.tasks.insert({
    id,
    repoId,
    title: "ship the thing",
    prompt: "a prompt",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status,
    origin: "agn",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function repos(query = ""): Promise<Response> {
  return daemon.request(`/repos${query}`);
}

function close(id: string): Promise<Response> {
  return daemon.request(`/repos/${id}/close`, { method: "POST" });
}

async function gitRepo(name: string): Promise<string> {
  const path = join(workspace, name);
  await mkdir(path, { recursive: true });
  await run("git", ["init"], { cwd: path });
  return path;
}

describe("GET /repos", () => {
  it("starts empty", async () => {
    const response = await daemon.request("/repos");
    expect(response.status).toBe(200);
    expect(((await response.json()) as RepoListResponse).repos).toEqual([]);
  });

  it("lists what was registered", async () => {
    await post({ path: await gitRepo("alpha") });
    const body = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(body.repos.map((repo) => repo.name)).toEqual(["alpha"]);
  });

  it("carries each repo's test command, so the CLI never opens the file itself", async () => {
    const path = await gitRepo("alpha");
    await writeRepoConfig(path, { ...defaultRepoConfig(newId()), testCommand: "pnpm test" });
    await post({ path });
    const body = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(body.repos[0]?.testCommand).toBe("pnpm test");
  });

  it("carries the ledger's latest event id as the cursor, never older than the rows", async () => {
    await post({ path: await gitRepo("alpha") });
    const body = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(body.cursor).toBe(daemon.ledger.events.latestId());
    const registered = daemon.ledger.events.latest("repo.registered");
    expect(registered?.id).toBeLessThanOrEqual(body.cursor);

    await post({ path: await gitRepo("beta") });
    const after = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(after.cursor).toBeGreaterThan(body.cursor);
    expect(after.repos).toHaveLength(2);
  });

  it("lists a repo whose config is malformed or gone, with no command", async () => {
    const broken = await gitRepo("broken");
    await post({ path: broken });
    await mkdir(join(broken, ".ag"), { recursive: true });
    await writeFile(join(broken, ".ag", "agnostic.yaml"), "id: [unclosed\n");
    await post({ path: await gitRepo("plain") });

    const body = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(body.repos.map((repo) => repo.testCommand)).toEqual([null, null]);
  });

  it("carries pathPresent true for a git repo and a folder repo that are both on disk", async () => {
    await post({ path: await gitRepo("git-repo") });
    const folder = join(workspace, "folder-repo");
    await mkdir(folder, { recursive: true });
    await post({ path: folder });

    const body = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(body.repos.every((repo) => repo.pathPresent)).toBe(true);
  });

  it("flips pathPresent false once a repo's own directory is gone", async () => {
    const path = await gitRepo("alpha");
    await post({ path });
    await rm(path, { recursive: true, force: true });

    const body = (await (await daemon.request("/repos")).json()) as RepoListResponse;
    expect(body.repos[0]?.pathPresent).toBe(false);
  });
});

describe("POST /repos", () => {
  it("answers 201 the first time and 200 the second", async () => {
    const path = await gitRepo("alpha");
    const first = await post({ path });
    expect(first.status).toBe(201);
    const created = (await first.json()) as RegisterRepoResponse;
    expect(created).toMatchObject({ created: true, repo: { kind: "git", name: "alpha" } });

    const second = await post({ path });
    expect(second.status).toBe(200);
    const again = (await second.json()) as RegisterRepoResponse;
    expect(again.created).toBe(false);
    expect(again.repo.id).toBe(created.repo.id);
  });

  it("rejects a body with no path", async () => {
    const response = await post({});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("rejects an unknown field", async () => {
    expect((await post({ path: workspace, branch: "main" })).status).toBe(400);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await daemon.request("/repos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(response.status).toBe(400);
  });

  it("maps a missing path to 400 path-not-found", async () => {
    const response = await post({ path: join(workspace, "ghost") });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "path-not-found" } });
  });

  it("maps a malformed agnostic.yaml to 400", async () => {
    const path = await gitRepo("broken");
    await mkdir(join(path, ".ag"), { recursive: true });
    await writeFile(join(path, ".ag", "agnostic.yaml"), "id: [unclosed\n");
    const response = await post({ path });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "ag-file-malformed" } });
  });

  it("refuses a path under agn's worktrees with 400", async () => {
    const inside = join(daemon.paths.worktrees, "repo", "task");
    await mkdir(inside, { recursive: true });
    const response = await post({ path: inside });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "path-inside-worktrees" } });
  });
});

describe("POST /repos/:id/close", () => {
  it("archives the repo and takes it out of the default list", async () => {
    const id = await register("alpha");
    await register("beta");
    const response = await close(id);
    expect(response.status).toBe(200);
    expect(((await response.json()) as RepoResponse).repo).toMatchObject({ status: "archived" });

    const listed = (await (await repos()).json()) as RepoListResponse;
    expect(listed.repos.map((repo) => repo.name)).toEqual(["beta"]);
    expect(listed.cursor).toBe(daemon.ledger.events.latestId());

    const all = (await (await repos("?all=1")).json()) as RepoListResponse;
    expect(all.repos.map((repo) => repo.status)).toEqual(["archived", "active"]);
  });

  it("rejects a query value it does not know", async () => {
    expect((await repos("?all=yes")).status).toBe(400);
    expect((await repos("?archived=1")).status).toBe(400);
  });

  it("refuses while a task is running or waiting, and changes nothing", async () => {
    const id = await register("alpha");
    for (const status of ["running", "waiting"] as const) {
      const taskId = seedTask(id, status);
      const response = await close(id);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: "repo-busy", hint: `Run \`agn stop ${taskId}\` first.` },
      });
      expect(daemon.ledger.repos.get(id)?.status).toBe("active");
      daemon.ledger.tasks.setStatus(taskId, "done");
    }
  });

  it("closes a repo whose only task is done, failed or stopped", async () => {
    for (const status of ["done", "failed", "stopped"] as const) {
      const id = await register(`alpha-${status}`);
      seedTask(id, status);
      expect((await close(id)).status).toBe(200);
      expect(daemon.ledger.repos.get(id)?.status).toBe("archived");
    }
  });

  it("is idempotent: the second close writes no event", async () => {
    const id = await register("alpha");
    await close(id);
    const latest = daemon.ledger.events.latestId();
    expect((await close(id)).status).toBe(200);
    expect(daemon.ledger.events.latestId()).toBe(latest);
  });

  it("resolves a closed repo by id prefix, and opens it again", async () => {
    const id = await register("alpha");
    await close(id);
    const response = await daemon.request(`/repos/${id.slice(0, 4)}/open`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(((await response.json()) as RepoResponse).repo.status).toBe("active");
    expect(daemon.ledger.events.latest("repo.updated")?.payload).toMatchObject({
      repo: { id, status: "active" },
    });
    expect(((await (await repos()).json()) as RepoListResponse).repos).toHaveLength(1);
  });
});
