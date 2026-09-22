import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ChangedFile,
  type ChangesResponse,
  type DiffResponse,
  newId,
  type Repo,
  type Task,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { gitIn, repoWithConfig, startTask } from "../test-task-run.js";

let daemon: TestDaemon;
let repo: Repo;
let task: Task;
let worktree = "";

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await repoWithConfig(daemon);
  task = await startTask(daemon, repo);
  worktree = task.worktreePath ?? "";
});

afterEach(() => daemon.close());

async function changes(id = task.id): Promise<ChangesResponse> {
  const response = await daemon.request(`/tasks/${id}/changes`);
  expect(response.status).toBe(200);
  return (await response.json()) as ChangesResponse;
}

async function diff(path: string): Promise<DiffResponse> {
  const response = await daemon.request(`/tasks/${task.id}/diff?path=${encodeURIComponent(path)}`);
  expect(response.status).toBe(200);
  return (await response.json()) as DiffResponse;
}

async function failure(response: Response): Promise<{ code: string; hint: string }> {
  return ((await response.json()) as { error: { code: string; hint: string } }).error;
}

function row(body: ChangesResponse, path: string): ChangedFile | undefined {
  return body.files.find((file) => file.path === path);
}

/** What the agent leaves behind: a commit, an edit it has not committed, and a new file. */
async function work(): Promise<void> {
  await writeFile(join(worktree, "a.ts"), "export const a = 1;\n");
  await gitIn(worktree, ["add", "a.ts"]);
  await gitIn(worktree, ["commit", "-q", "-m", "add a"]);
  await writeFile(join(worktree, "README.md"), "# fixture\nedited\n");
  await writeFile(join(worktree, "notes.md"), "a note\n");
}

describe("GET /tasks/:id/changes", () => {
  it("lists committed, uncommitted and untracked work against the task's base", async () => {
    await work();
    const body = await changes();
    expect(body.base.ref).toBe("main");
    expect(body.base.commit).toBe(task.baseCommit);
    expect(body.ahead).toBe(1);
    expect(body.uncommitted).toBe(2);
    expect(body.pushed).toBe(false);
    expect(body.remote).toBeNull();
    expect(row(body, "a.ts")).toEqual({
      path: "a.ts",
      status: "added",
      additions: 1,
      deletions: 0,
    });
    expect(row(body, "README.md")).toMatchObject({ status: "modified", additions: 1 });
    expect(row(body, "notes.md")).toEqual({
      path: "notes.md",
      status: "untracked",
      additions: 1,
      deletions: 0,
    });
  });

  it("reads a deleted file, a rename and a binary file", async () => {
    await writeFile(join(worktree, "gone.txt"), "one\n");
    await gitIn(worktree, ["add", "gone.txt"]);
    await gitIn(worktree, ["commit", "-q", "-m", "a file to delete"]);
    await gitIn(worktree, ["rm", "-q", "gone.txt"]);
    await gitIn(worktree, ["mv", "README.md", "readme.md"]);
    await writeFile(join(worktree, "logo.bin"), Buffer.from([0, 1, 2, 0, 3]));
    const body = await changes();
    expect(row(body, "readme.md")).toMatchObject({ status: "renamed", additions: 0, deletions: 0 });
    expect(row(body, "gone.txt")).toBeUndefined();
    expect(row(body, "logo.bin")).toMatchObject({
      status: "untracked",
      additions: null,
      deletions: null,
    });
  });

  it("reads the remote and the upstream once the branch has been pushed", async () => {
    const bare = await mkdtemp(join(tmpdir(), "agn-remote-"));
    try {
      await gitIn(bare, ["init", "-q", "--bare", "-b", "main", "."]);
      await gitIn(worktree, ["remote", "add", "origin", bare]);
      await gitIn(worktree, ["push", "-q", "--set-upstream", "origin", task.branch ?? ""]);
      const body = await changes();
      expect(body.pushed).toBe(true);
      expect(body.remote).toBe(bare);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("counts the commits the base branch gained as behind", async () => {
    await writeFile(join(repo.path, "later.txt"), "later\n");
    await gitIn(repo.path, ["add", "later.txt"]);
    await gitIn(repo.path, ["commit", "-q", "-m", "a commit on main"]);
    expect((await changes()).behind).toBe(1);
  });

  it("reads the branch from the main checkout once the worktree is cleaned", async () => {
    await work();
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    const cleaned = await daemon.request(`/tasks/${task.id}/clean`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    expect(cleaned.status).toBe(200);
    const body = await changes();
    expect(body.files.map((file) => file.path)).toEqual(["a.ts"]);
    expect(body.uncommitted).toBe(0);
  });

  it("refuses a branch that was deleted with the worktree", async () => {
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    await daemon.request(`/tasks/${task.id}/clean`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ force: true, deleteBranch: true }),
    });
    const response = await daemon.request(`/tasks/${task.id}/changes`);
    expect(response.status).toBe(409);
    expect((await failure(response)).code).toBe("branch-gone");
  });

  it("says a folder workspace has no git to read", async () => {
    const folder = await repoWithConfig(daemon, { git: false });
    const queued = daemon.ledger.tasks.insert({
      ...seedRow(folder.id),
      worktreePath: null,
      branch: null,
    });
    const response = await daemon.request(`/tasks/${queued.id}/changes`);
    expect(response.status).toBe(409);
    const error = await failure(response);
    expect(error.code).toBe("repo-not-git");
    expect(error.hint).toContain("--git-init");
  });

  it("answers an empty list for a task that has not started yet", async () => {
    const queued = daemon.ledger.tasks.insert({
      ...seedRow(repo.id),
      worktreePath: null,
      branch: null,
    });
    const body = await changes(queued.id);
    expect(body.files).toEqual([]);
    expect(body.ahead).toBe(0);
    expect(body.base.ref).toBe("main");
  });

  it("reads an adopted task's changes from the checkout's toplevel, not the session's subdirectory", async () => {
    const adoptedRepo = await daemon.addRepo();
    await mkdir(join(adoptedRepo.path, "sub"), { recursive: true });
    await writeFile(join(adoptedRepo.path, "top.md"), "a change at the root\n");
    await writeFile(join(adoptedRepo.path, "sub", "note.txt"), "a change under the session cwd\n");
    const seeded = daemon.ledger.tasks.insert({
      ...seedRow(adoptedRepo.id),
      worktreePath: null,
      branch: null,
    });
    const now = new Date().toISOString();
    const adopted = daemon.ledger.tasks.start(seeded.id, {
      branch: null,
      baseCommit: null,
      session: {
        harness: "claude-code",
        sessionId: null,
        tmuxSession: null,
        tmuxSocket: null,
        launchId: null,
        pid: 4242,
        cwd: join(adoptedRepo.path, "sub"),
        lastSeenAt: now,
      },
    });

    const body = await changes(adopted.id);
    expect(body.uncommitted).toBe(2);
    expect(body.files.map((file) => file.path).sort()).toEqual(["sub/note.txt", "top.md"]);
  });
});

describe("GET /tasks/:id/diff", () => {
  it("answers git's own patch for a tracked file", async () => {
    await work();
    const { patch } = await diff("README.md");
    expect(patch).toContain("@@");
    expect(patch).toContain("+edited");
  });

  it("answers the whole file for an untracked one", async () => {
    await work();
    const { patch } = await diff("notes.md");
    expect(patch).toContain("--- /dev/null");
    expect(patch).toContain("+a note");
  });

  it("carries the old name of a rename", async () => {
    await gitIn(worktree, ["mv", "README.md", "readme.md"]);
    expect((await diff("readme.md")).patch).toContain("rename from README.md");
  });

  it("answers git's own binary marker for a binary file's patch", async () => {
    await writeFile(join(worktree, "logo.bin"), Buffer.from([0, 1, 2, 0, 3]));
    const { patch } = await diff("logo.bin");
    expect(patch).toContain("Binary files");
  });

  it("answers an empty patch for a path with no change", async () => {
    expect(await diff("README.md")).toEqual({ patch: "" });
  });

  it("refuses a path that leaves the repo, and a request with none", async () => {
    const outside = await daemon.request(
      `/tasks/${task.id}/diff?path=${encodeURIComponent("../x")}`,
    );
    expect(outside.status).toBe(400);
    expect((await failure(outside)).code).toBe("request-invalid");
    expect((await daemon.request(`/tasks/${task.id}/diff`)).status).toBe(400);
  });
});

/** A row the ledger has but the executor never saw: what a queued task looks like. */
function seedRow(repoId: string) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    repoId,
    title: "a queued task",
    prompt: "do the thing",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    baseCommit: null,
    status: "queued" as const,
    origin: "agn" as const,
    createdAt: now,
    updatedAt: now,
  };
}
