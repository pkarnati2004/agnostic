import type { Repo, Task, TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function runTask(repo: Repo): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "add a --verbose flag" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

describe("GET /tasks/:id/attach", () => {
  it("refuses a session that is not under tmux and points at resume", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    const session = task.session;
    if (session === undefined) {
      throw new Error("the launched task has no session");
    }
    daemon.ledger.tasks.setSession(task.id, {
      ...session,
      tmuxSession: null,
      tmuxSocket: null,
      pid: process.pid,
    });

    const response = await daemon.request(`/tasks/${task.id}/attach`);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; hint: string } };
    expect(body.error.code).toBe("session-not-attachable");
    expect(body.error.hint).toContain(`agn resume ${task.id}`);
  });
});
