import {
  newId,
  type Task,
  type TaskListResponse,
  type TaskResponse,
  type TaskStatus,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";

let daemon: TestDaemon;
let repoId: string;

beforeEach(async () => {
  daemon = await createTestDaemon();
  repoId = newId();
  daemon.ledger.repos.insert({
    id: repoId,
    path: "/tmp/alpha",
    kind: "git",
    name: "alpha",
    addedAt: new Date().toISOString(),
  });
});

afterEach(() => daemon.close());

function seedTask(id: string, status: TaskStatus): Task {
  const now = new Date().toISOString();
  return daemon.ledger.tasks.insert({
    id,
    repoId,
    title: "ship the thing",
    prompt: "a prompt that must never reach the log",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status,
    origin: "agn",
    createdAt: now,
    updatedAt: now,
  });
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("GET /repos/:id/tasks", () => {
  it("lists the repo's tasks", async () => {
    seedTask("mnpqrstuvw", "running");
    seedTask("zyxwvutsrq", "done");
    const response = await daemon.request(`/repos/${repoId}/tasks`);
    expect(response.status).toBe(200);
    expect((await body<TaskListResponse>(response)).tasks).toHaveLength(2);
  });

  it("filters by a comma-separated status list", async () => {
    seedTask("mnpqrstuvw", "running");
    seedTask("zyxwvutsrq", "done");
    seedTask("abcdefghjk", "waiting");
    const response = await daemon.request(`/repos/${repoId}/tasks?status=running,waiting`);
    const tasks = (await body<TaskListResponse>(response)).tasks;
    expect(tasks.map((task) => task.status).sort()).toEqual(["running", "waiting"]);
  });

  it("rejects a status that is not a status", async () => {
    const response = await daemon.request(`/repos/${repoId}/tasks?status=sideways`);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "request-invalid" } });
  });

  it("accepts a repo prefix", async () => {
    seedTask("mnpqrstuvw", "running");
    const response = await daemon.request(`/repos/${repoId.slice(0, 3)}/tasks`);
    expect(response.status).toBe(200);
  });

  it("answers 404 for an unknown repo", async () => {
    const response = await daemon.request("/repos/qqqqqqqqqq/tasks");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "repo-not-found" } });
  });
});

describe("GET /tasks/:id", () => {
  it("returns a task by its whole id", async () => {
    const task = seedTask("mnpqrstuvw", "running");
    const response = await daemon.request(`/tasks/${task.id}`);
    expect(response.status).toBe(200);
    expect((await body<TaskResponse>(response)).task.id).toBe(task.id);
  });

  it("returns a task by a three-character prefix", async () => {
    seedTask("mnpqrstuvw", "running");
    const response = await daemon.request("/tasks/mnp");
    expect((await body<TaskResponse>(response)).task.id).toBe("mnpqrstuvw");
  });

  it("answers 400 ambiguous-id with the candidates when a prefix matches two", async () => {
    seedTask("mnpqrstuvw", "running");
    seedTask("mnpzyxwvut", "done");
    const response = await daemon.request("/tasks/mnp");
    expect(response.status).toBe(400);
    const failure = await body<{ error: { code: string; hint: string } }>(response);
    expect(failure.error.code).toBe("ambiguous-id");
    expect(failure.error.hint).toContain("mnpqrstuvw");
    expect(failure.error.hint).toContain("mnpzyxwvut");
  });

  it("answers 404 with a hint for an unknown task", async () => {
    const response = await daemon.request("/tasks/qqqqqqqqqq");
    expect(response.status).toBe(404);
    const failure = await body<{ error: { code: string; hint: string } }>(response);
    expect(failure.error.code).toBe("task-not-found");
    expect(failure.error.hint).toBeTruthy();
  });
});
