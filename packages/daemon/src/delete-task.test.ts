import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  DeleteTaskResponse,
  Repo,
  Task,
  TaskListResponse,
  TaskResponse,
} from "@agnostic/core";
import { newId, run } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";
import { shimGit } from "./test-git-shim.js";

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

/** Stopped and settled: the close work has written the outcome row the delete has to remove. */
async function stopped(): Promise<Task> {
  const task = await start();
  const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
  const after = ((await response.json()) as TaskResponse).task;
  await daemon.request(`/tasks/${task.id}/outcome`);
  return after;
}

function remove(id: string): Promise<Response> {
  return daemon.request(`/tasks/${id}`, { method: "DELETE" });
}

async function branchExists(task: Task): Promise<boolean> {
  const result = await run(
    "git",
    ["-C", repo.path, "rev-parse", "--verify", "--quiet", `refs/heads/${task.branch}`],
    { env: daemon.launch?.env, inheritEnv: false },
  ).catch(() => null);
  return result !== null;
}

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe("DELETE /tasks/:id", () => {
  it("removes the worktree and the rows, and keeps the branch", async () => {
    const task = await stopped();
    // Work no commit is keeping is removed with the worktree: a delete is not a clean.
    await writeFile(join(task.worktreePath ?? "", "scratch.txt"), "in progress", "utf8");
    const response = await remove(task.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deleted: true,
      taskId: task.id,
      branch: task.branch,
      removedWorktree: true,
    });
    expect(await exists(task.worktreePath ?? "")).toBe(false);
    expect(await branchExists(task)).toBe(true);
    expect((await daemon.request(`/tasks/${task.id}`)).status).toBe(404);
    expect(daemon.ledger.outcomes.get(task.id)).toBeNull();
  });

  it("answers removedWorktree false for a task already cleaned", async () => {
    const task = await stopped();
    await daemon.request(`/tasks/${task.id}/clean`, { method: "POST" });
    const body = (await (await remove(task.id)).json()) as DeleteTaskResponse;
    expect(body.removedWorktree).toBe(false);
    expect(daemon.ledger.tasks.get(task.id)).toBeNull();
  });

  it("records one task.deleted the task's own events do not take with them", async () => {
    const task = await stopped();
    const cursor = daemon.ledger.events.latestId();
    await remove(task.id);
    const events = daemon.ledger.events.after(cursor);
    expect(events.map((event) => event.kind)).toEqual(["task.deleted"]);
    expect(events[0]).toMatchObject({ taskId: task.id, payload: { removedWorktree: true } });
  });

  it("refuses a running task and names stop, leaving the worktree where it is", async () => {
    const task = await start();
    const response = await remove(task.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "task-active", message: `task ${task.id} is still running` },
    });
    const failure = (await (await remove(task.id)).json()) as { error: { hint: string } };
    expect(failure.error.hint).toContain(`agn stop ${task.id}`);
    expect(await exists(task.worktreePath ?? "")).toBe(true);
  });

  it("refuses a queued task, which is inside the launch that made it", async () => {
    const queued = daemon.ledger.tasks.insert({
      id: newId(),
      repoId: repo.id,
      title: "queued",
      prompt: "wait",
      profileId: PROFILE,
      worktreePath: null,
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      compareId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const response = await remove(queued.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "task-active" } });
    expect(daemon.ledger.tasks.get(queued.id)).not.toBeNull();
  });

  it("changes no row when the worktree will not be removed", async () => {
    const task = await stopped();
    const events = daemon.ledger.events.forTask(task.id).length;
    const restore = await shimGit("fatal: Unable to create '.git/index.lock': File exists.");
    try {
      const response = await remove(task.id);
      expect(response.status).toBe(409);
      const failure = (await response.json()) as { error: { code: string; hint: string } };
      expect(failure.error.code).toBe("worktree-remove-failed");
      expect(failure.error.hint).toContain(`agn task delete ${task.id}`);
    } finally {
      restore();
    }
    expect(daemon.ledger.tasks.get(task.id)).not.toBeNull();
    expect(daemon.ledger.events.forTask(task.id)).toHaveLength(events);
    expect(await exists(task.worktreePath ?? "")).toBe(true);
  });

  it("leaves a handoff child as a root when its parent is deleted", async () => {
    const parent = await stopped();
    const child = daemon.ledger.tasks.insert({
      ...parent,
      id: newId(),
      parentTaskId: parent.id,
      status: "stopped",
      worktreePath: null,
      branch: null,
    });
    await remove(parent.id);
    const response = await daemon.request(`/tasks/${child.id}`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as TaskResponse).task.parentTaskId).toBeUndefined();
  });

  it("still lists the child in GET /tasks once its parent is gone", async () => {
    const parent = await stopped();
    const child = daemon.ledger.tasks.insert({
      ...parent,
      id: newId(),
      parentTaskId: parent.id,
      status: "stopped",
      worktreePath: null,
      branch: null,
    });
    await remove(parent.id);
    const response = await daemon.request("/tasks");
    const { tasks } = (await response.json()) as TaskListResponse;
    expect(tasks.map((task) => task.id)).toContain(child.id);
    expect(tasks.find((task) => task.id === child.id)?.parentTaskId).toBeUndefined();
  });

  it("has nothing to remove for a folder task, which never had a worktree", async () => {
    const folder = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const created = await daemon.request(`/repos/${folder.id}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "in place" }),
    });
    const running = ((await created.json()) as TaskResponse).task;
    expect(running.worktreePath).toBeNull();
    await daemon.request(`/tasks/${running.id}/stop`, { method: "POST" });
    await daemon.request(`/tasks/${running.id}/outcome`);
    const body = (await (await remove(running.id)).json()) as DeleteTaskResponse;
    expect(body.removedWorktree).toBe(false);
    expect(await exists(folder.path)).toBe(true);
    expect(daemon.ledger.tasks.get(running.id)).toBeNull();
  });

  it("refuses a waiting task the same way as a running one", async () => {
    const task = await start();
    daemon.ledger.tasks.setStatus(task.id, "waiting");
    const response = await remove(task.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "task-active" } });
    expect(await exists(task.worktreePath ?? "")).toBe(true);
  });

  it("answers task-not-found for a second delete of the same id", async () => {
    const task = await stopped();
    expect((await remove(task.id)).status).toBe(200);
    const second = await remove(task.id);
    expect(second.status).toBe(404);
    expect(await second.json()).toMatchObject({ error: { code: "task-not-found" } });
  });
});
