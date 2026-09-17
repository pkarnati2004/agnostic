import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RegisterRepoResponse,
  RemoveRepoResponse,
  RepoListResponse,
  TaskStatus,
} from "@agnostic/core";
import { newId, run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;
let workspace: string;

beforeEach(async () => {
  daemon = await createTestDaemon();
  workspace = await realpath(await mkdtemp(join(tmpdir(), "agn-repos-remove-")));
});

afterEach(async () => {
  await daemon.close();
  await rm(workspace, { recursive: true, force: true });
});

async function gitRepo(name: string): Promise<string> {
  const path = join(workspace, name);
  await mkdir(path, { recursive: true });
  await run("git", ["init"], { cwd: path });
  return path;
}

async function register(name: string): Promise<string> {
  const response = await daemon.request("/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: await gitRepo(name) }),
  });
  return ((await response.json()) as RegisterRepoResponse).repo.id;
}

function del(id: string): Promise<Response> {
  return daemon.request(`/repos/${id}`, { method: "DELETE" });
}

function repos(query = ""): Promise<Response> {
  return daemon.request(`/repos${query}`);
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

describe("DELETE /repos/:id", () => {
  it("marks the repo removed and counts the task worktrees it deletes", async () => {
    const id = await register("alpha");
    const root = join(daemon.paths.worktrees, id);
    await mkdir(join(root, "t1"), { recursive: true });
    await mkdir(join(root, "t2"), { recursive: true });

    const response = await del(id);
    expect(response.status).toBe(200);
    const body = (await response.json()) as RemoveRepoResponse;
    expect(body).toMatchObject({ repo: { id, status: "removed" }, worktreesRemoved: 2 });

    expect(daemon.ledger.repos.get(id)?.status).toBe("removed");
    await expect(realpath(root)).rejects.toThrow();
  });

  it("removes an archived repo too", async () => {
    const id = await register("alpha");
    await daemon.request(`/repos/${id}/close`, { method: "POST" });
    expect((await del(id)).status).toBe(200);
    expect(daemon.ledger.repos.get(id)?.status).toBe("removed");
  });

  it("is idempotent: the second call answers 0 worktrees and writes no event", async () => {
    const id = await register("alpha");
    await del(id);
    const latest = daemon.ledger.events.latestId();

    const second = await del(id);
    expect(second.status).toBe(200);
    expect(((await second.json()) as RemoveRepoResponse).worktreesRemoved).toBe(0);
    expect(daemon.ledger.events.latestId()).toBe(latest);
  });

  it("refuses while a task is running or waiting, leaving the row and the worktree alone", async () => {
    const id = await register("alpha");
    const root = join(daemon.paths.worktrees, id, "t1");
    await mkdir(root, { recursive: true });

    for (const status of ["running", "waiting"] as const) {
      const taskId = seedTask(id, status);
      const response = await del(id);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: "repo-busy", hint: `Run \`agn stop ${taskId}\` first.` },
      });
      expect(daemon.ledger.repos.get(id)?.status).toBe("active");
      await expect(realpath(root)).resolves.toBeTruthy();
      daemon.ledger.tasks.setStatus(taskId, "done");
    }
  });

  it("removes a repo whose only task is done", async () => {
    const id = await register("alpha");
    seedTask(id, "done");
    expect((await del(id)).status).toBe(200);
    expect(daemon.ledger.repos.get(id)?.status).toBe("removed");
  });
});

describe("GET /repos with a removed row", () => {
  it("leaves a removed repo out of both the default list and ?all=1", async () => {
    const kept = await register("alpha");
    const gone = await register("beta");
    await del(gone);

    const list = (await (await repos()).json()) as RepoListResponse;
    expect(list.repos.map((repo) => repo.id)).toEqual([kept]);

    const all = (await (await repos("?all=1")).json()) as RepoListResponse;
    expect(all.repos.map((repo) => repo.id)).toEqual([kept]);
  });

  it("still lists an archived repo under ?all=1", async () => {
    const id = await register("alpha");
    await daemon.request(`/repos/${id}/close`, { method: "POST" });

    const all = (await (await repos("?all=1")).json()) as RepoListResponse;
    expect(all.repos.map((repo) => repo.status)).toEqual(["archived"]);
  });
});
