import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  HandoffTaskResponse,
  Repo,
  Task,
  TaskNoteHandoff,
  TaskResponse,
} from "@agnostic/core";
import { readTaskNote } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await daemon.addRepo();
});

afterEach(() => daemon.close());

async function design(): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "wireframe the onboarding", intent: "design" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

async function stop(task: Task): Promise<Task> {
  const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
  expect(response.status).toBe(200);
  return ((await response.json()) as TaskResponse).task;
}

/** What the human did in the design tool: files under the task's design folder. */
function designFile(task: Task, name: string): Promise<void> {
  return writeFile(join(task.worktreePath ?? "", "design", name), "# home\n");
}

function lastHandoff(handoffs: TaskNoteHandoff[]): TaskNoteHandoff {
  const last = handoffs.at(-1);
  if (last === undefined) {
    throw new Error("the note has no handoff section");
  }
  return last;
}

function failure(response: Response): Promise<{ code: string; hint?: string }> {
  return response.json().then((body) => (body as { error: { code: string; hint?: string } }).error);
}

describe("POST /tasks/:id/stop on a design task", () => {
  it("finishes it done and writes a handoff section naming nobody", async () => {
    const task = await design();
    await designFile(task, "home.md");
    const done = await stop(task);
    expect(done.status).toBe("done");

    const note = await readTaskNote(repo.path, task.id);
    const handoff = lastHandoff(note?.handoffs ?? []);
    expect(handoff.toProfileId).toBeNull();
    expect(handoff.at).toBe(done.updatedAt);
    expect(handoff.body).toContain("### Goal\n\nwireframe the onboarding");
    expect(handoff.body).toContain("Designed in Claude Design.");
    expect(handoff.body).toContain(`design/ on branch ${done.branch}`);
    // `git status --porcelain` collapses an untracked directory, so the folder is what it lists.
    expect(handoff.body).toContain("?? design/");

    const text = await readFile(join(repo.path, ".ag", "tasks", `${task.id}.md`), "utf8");
    expect(text).toContain(`## Handoff at ${done.updatedAt}`);
  });

  it("does nothing on a second stop", async () => {
    const task = await design();
    const done = await stop(task);
    const again = await stop(done);
    expect(again.updatedAt).toBe(done.updatedAt);
    expect((await readTaskNote(repo.path, task.id))?.handoffs).toHaveLength(1);
  });
});

describe("a design task has no agent session", () => {
  it.each([
    ["resume", "resume"],
    ["update", "update"],
  ])("refuses %s", async (_name, action) => {
    const task = await design();
    const response = await daemon.request(`/tasks/${task.id}/${action}`, { method: "POST" });
    expect(response.status).toBe(409);
    const error = await failure(response);
    expect(error.code).toBe("design-task-no-session");
    expect(error.hint).toContain(`agn open ${task.id} --tool`);
  });

  it("refuses attach", async () => {
    const task = await design();
    const response = await daemon.request(`/tasks/${task.id}/attach`);
    expect(response.status).toBe(409);
    expect((await failure(response)).code).toBe("design-task-no-session");
  });
});

describe("POST /tasks/:id/handoff on a design task", () => {
  it("finishes the design and starts the agent from its branch", async () => {
    const task = await design();
    await designFile(task, "home.md");
    const response = await daemon.request(`/tasks/${task.id}/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "claude-code", note: "build the page from the wireframe" }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as HandoffTaskResponse;
    expect(body.parent.status).toBe("done");
    expect(body.task.parentTaskId).toBe(task.id);
    expect(body.task.status).toBe("running");

    const handoff = lastHandoff((await readTaskNote(repo.path, task.id))?.handoffs ?? []);
    expect(handoff.toProfileId).toBe("claude-code:default:native");
    expect(handoff.body).toContain("build the page from the wireframe");
  });
});
