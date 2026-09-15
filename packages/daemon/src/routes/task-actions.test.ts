import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AttachResponse, CleanTaskResponse, Repo, Task, TaskResponse } from "@agnostic/core";
import { run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await daemon.addRepo({ defaultProfile: PROFILE });
});

afterEach(() => daemon.close());

async function start(): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "do the thing" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

async function stop(task: Task): Promise<Task> {
  const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
  return ((await response.json()) as TaskResponse).task;
}

function clean(task: Task, body?: Record<string, unknown>): Promise<Response> {
  return daemon.request(`/tasks/${task.id}/clean`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

async function branchExists(task: Task): Promise<boolean> {
  const result = await run(
    "git",
    ["-C", repo.path, "rev-parse", "--verify", "--quiet", `refs/heads/${task.branch}`],
    { env: daemon.launch?.env, inheritEnv: false },
  ).catch(() => null);
  return result !== null;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe("GET /tasks/:id/attach", () => {
  it("answers with the tmux argv for a live session", async () => {
    const task = await start();
    const response = await daemon.request(`/tasks/${task.id}/attach`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as AttachResponse;
    expect(body.attach.kind).toBe("tmux");
    expect(body.attach.argv).toContain(daemon.launch?.socketName);
    expect(body.attach.argv).toContain(`agn-${task.id}`);
  });

  it("refuses a task with no session running and names resume", async () => {
    const task = await stop(await start());
    const response = await daemon.request(`/tasks/${task.id}/attach`);
    expect(response.status).toBe(409);
    const failure = (await response.json()) as { error: { code: string; hint: string } };
    expect(failure.error.code).toBe("session-not-running");
    expect(failure.error.hint).toContain(`agn resume ${task.id}`);
  });
});

describe("POST /tasks/:id/clean", () => {
  it("removes the worktree, keeps the branch, and records the event once", async () => {
    const task = await stop(await start());
    const response = await clean(task);
    expect(response.status).toBe(200);
    const body = (await response.json()) as CleanTaskResponse;
    expect(body.removed).toBe(true);
    expect(await exists(task.worktreePath ?? "")).toBe(false);
    expect(await branchExists(task)).toBe(true);

    const again = (await (await clean(task)).json()) as CleanTaskResponse;
    expect(again.removed).toBe(false);
    expect(
      daemon.ledger.events.forTask(task.id).filter((event) => event.kind === "task.cleaned"),
    ).toHaveLength(1);
  });

  it("deletes the branch when asked", async () => {
    const task = await stop(await start());
    const response = await clean(task, { deleteBranch: true });
    expect(((await response.json()) as CleanTaskResponse).removed).toBe(true);
    expect(await branchExists(task)).toBe(false);
    const event = daemon.ledger.events
      .forTask(task.id)
      .findLast((row) => row.kind === "task.cleaned");
    expect(event?.payload).toEqual({ deletedBranch: true });
  });

  it("refuses a task that is still running", async () => {
    const task = await start();
    const response = await clean(task);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "task-active" } });
  });

  it("refuses a worktree with an untracked file and names --force", async () => {
    const task = await stop(await start());
    await writeFile(join(task.worktreePath ?? "", "scratch.txt"), "work in progress", "utf8");
    const response = await clean(task);
    expect(response.status).toBe(409);
    const failure = (await response.json()) as {
      error: { code: string; message: string; hint: string };
    };
    expect(failure.error.code).toBe("worktree-unsaved");
    expect(failure.error.message).toMatch(/it has uncommitted changes$/);
    expect(failure.error.hint).toContain(`agn clean ${task.id} --force`);
    expect(await exists(task.worktreePath ?? "")).toBe(true);
    expect(
      daemon.ledger.events.forTask(task.id).filter((event) => event.kind === "task.cleaned"),
    ).toHaveLength(0);
  });

  it("refuses a worktree whose tracked file was modified", async () => {
    const task = await stop(await start());
    await writeFile(join(task.worktreePath ?? "", "README.md"), "changed\n", "utf8");
    const response = await clean(task);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "worktree-unsaved", message: /uncommitted changes/ },
    });
  });

  it("refuses a worktree with a merge in progress", async () => {
    const task = await stop(await start());
    const gitDir = await run(
      "git",
      ["-C", task.worktreePath ?? "", "rev-parse", "--absolute-git-dir"],
      { env: daemon.launch?.env, inheritEnv: false },
    );
    await writeFile(join(gitDir.stdout.trim(), "MERGE_HEAD"), "deadbeef\n", "utf8");
    const response = await clean(task);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "worktree-unsaved", message: /a merge is in progress$/ },
    });
  });

  it("removes a worktree with uncommitted work when force is set", async () => {
    const task = await stop(await start());
    await writeFile(join(task.worktreePath ?? "", "scratch.txt"), "work in progress", "utf8");
    const response = await clean(task, { force: true });
    expect(response.status).toBe(200);
    expect(((await response.json()) as CleanTaskResponse).removed).toBe(true);
    expect(await exists(task.worktreePath ?? "")).toBe(false);
    expect(
      daemon.ledger.events.forTask(task.id).filter((event) => event.kind === "task.cleaned"),
    ).toHaveLength(1);
  });

  it("refuses a running task even with force, which only skips the unsaved check", async () => {
    const task = await start();
    const response = await clean(task, { force: true });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "task-active" } });
  });

  it("rejects a body whose force is not a boolean", async () => {
    const task = await stop(await start());
    const response = await clean(task, { force: "yes" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("rejects a body whose deleteBranch is not a boolean", async () => {
    const task = await stop(await start());
    const response = await clean(task, { deleteBranch: "yes" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("has nothing to remove for a folder task", async () => {
    const folder = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const response = await daemon.request(`/repos/${folder.id}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "in place" }),
    });
    const task = await stop(((await response.json()) as TaskResponse).task);
    const cleaned = (await (await clean(task)).json()) as CleanTaskResponse;
    expect(cleaned.removed).toBe(false);
    expect(await exists(folder.path)).toBe(true);
  });
});
