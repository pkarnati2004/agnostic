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
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function body<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("POST /repos/:id/tasks", () => {
  it("rejects a body with no prompt and a field it does not know", async () => {
    const noPrompt = await daemon.request(`/repos/${repoId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(noPrompt.status).toBe(400);
    expect(await noPrompt.json()).toMatchObject({ error: { code: "request-invalid" } });

    const unknownField = await daemon.request(`/repos/${repoId}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "ship it", harness: "codex" }),
    });
    expect(unknownField.status).toBe(400);
    expect(await unknownField.json()).toMatchObject({ error: { code: "request-invalid" } });
    expect(daemon.ledger.tasks.list()).toHaveLength(0);
  });
});

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

describe("GET /tasks", () => {
  it("lists every repo's tasks, newest first", async () => {
    const otherRepo = newId();
    daemon.ledger.repos.insert({
      id: otherRepo,
      path: "/tmp/beta",
      kind: "folder",
      name: "beta",
      addedAt: new Date().toISOString(),
    });
    seedTask("mnpqrstuvw", "running");
    daemon.ledger.tasks.insert({
      ...seedTask("zyxwvutsrq", "done"),
      id: "abcdefghjk",
      repoId: otherRepo,
      createdAt: "2030-01-01T00:00:00.000Z",
    });
    const response = await daemon.request("/tasks");
    expect(response.status).toBe(200);
    const tasks = (await body<TaskListResponse>(response)).tasks;
    // The newest is first; the other two share a timestamp, so only their presence is promised.
    expect(tasks[0]?.id).toBe("abcdefghjk");
    expect(tasks.map((task) => task.id).sort()).toEqual(["abcdefghjk", "mnpqrstuvw", "zyxwvutsrq"]);
  });

  it("filters across repos by status", async () => {
    seedTask("mnpqrstuvw", "running");
    seedTask("zyxwvutsrq", "done");
    seedTask("abcdefghjk", "failed");
    const response = await daemon.request("/tasks?status=done,failed");
    const tasks = (await body<TaskListResponse>(response)).tasks;
    expect(tasks.map((task) => task.status).sort()).toEqual(["done", "failed"]);
  });

  it("carries the ledger's latest event id as the cursor, never older than the rows", async () => {
    seedTask("mnpqrstuvw", "running");
    const listed = await body<TaskListResponse>(await daemon.request("/tasks"));
    expect(listed.cursor).toBe(daemon.ledger.events.latestId());
    // The row is in the snapshot, so the event that created it is at or before the cursor: a page
    // resuming the feed there cannot miss it.
    const created = daemon.ledger.events.forTask("mnpqrstuvw").map((event) => event.id);
    expect(Math.max(...created)).toBeLessThanOrEqual(listed.cursor);

    seedTask("zyxwvutsrq", "done");
    const again = await body<TaskListResponse>(await daemon.request("/tasks"));
    expect(again.cursor).toBeGreaterThan(listed.cursor);
    expect(again.tasks).toHaveLength(2);
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
