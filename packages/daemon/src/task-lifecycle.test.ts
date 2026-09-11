import {
  type Repo,
  run,
  type Task,
  type TaskListResponse,
  type TaskResponse,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;
let repo: Repo;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  repo = await daemon.addRepo({ defaultProfile: PROFILE });
});

afterEach(() => daemon.close());

async function start(profile?: string): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "do the thing", ...(profile === undefined ? {} : { profile }) }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function statusOf(id: string): string | undefined {
  return daemon.ledger.tasks.get(id)?.status;
}

function statusEvents(id: string): string[] {
  return daemon.ledger.events
    .forTask(id)
    .filter((event) => event.kind === "task.status")
    .map((event) => (event.payload as { to: string }).to);
}

async function readTask(id: string): Promise<Task> {
  const response = await daemon.request(`/tasks/${id}`);
  return ((await response.json()) as TaskResponse).task;
}

describe("exit detection", () => {
  it("records a clean exit as done", async () => {
    const task = await start("other:quitter");
    await waitFor("the task to finish", () => statusOf(task.id) === "done");
    expect(statusEvents(task.id)).toEqual(["running", "done"]);
  });

  it("records a non-zero exit as failed", async () => {
    const task = await start("other:failer");
    await waitFor("the task to fail", () => statusOf(task.id) === "failed");
    expect(statusEvents(task.id)).toEqual(["running", "failed"]);
  });

  it("leaves a terminal status alone when the exit arrives afterwards", async () => {
    const task = await start();
    await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    expect(statusOf(task.id)).toBe("stopped");
    // The pane dies after the stop, and its exit must not add a second transition.
    await new Promise((done) => setTimeout(done, 1_000));
    expect(statusEvents(task.id)).toEqual(["running", "stopped"]);
  });
});

describe("POST /tasks/:id/stop", () => {
  it("marks the task stopped and ends its session", async () => {
    const task = await start();
    const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(((await response.json()) as TaskResponse).task.status).toBe("stopped");
    await waitFor("the tmux session to go", async () => {
      const listed = await run("tmux", ["-L", daemon.launch?.socketName ?? "", "ls"], {
        env: daemon.launch?.env,
        inheritEnv: false,
      }).catch(() => ({ stdout: "" }));
      return !listed.stdout.includes(`agn-${task.id}`);
    });
  });

  it("is idempotent, and does nothing to a task that already finished", async () => {
    const task = await start("other:quitter");
    await waitFor("the task to finish", () => statusOf(task.id) === "done");
    const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(((await response.json()) as TaskResponse).task.status).toBe("done");
    expect(statusEvents(task.id)).toEqual(["running", "done"]);
  });
});

describe("reconciliation", () => {
  it("reports a task whose tmux server went away as stopped on the next read", async () => {
    const task = await start();
    await run("tmux", ["-L", daemon.launch?.socketName ?? "", "kill-server"], {
      env: daemon.launch?.env,
      inheritEnv: false,
    }).catch(() => undefined);
    const listed = await daemon.request("/tasks");
    const tasks = ((await listed.json()) as TaskListResponse).tasks;
    expect(tasks.find((row) => row.id === task.id)?.status).toBe("stopped");
    expect((await readTask(task.id)).status).toBe("stopped");
  });
});

describe("start-up reconcile", () => {
  it("stops a task the ledger calls running when its session is gone", async () => {
    const id = "mnpqrstuvw";
    const seeded = await createTestDaemon({
      tmux: true,
      seed: (ledger) => {
        const now = new Date().toISOString();
        ledger.repos.insert({
          id: "rrrrrrrrrr",
          path: "/tmp",
          kind: "git",
          name: "r",
          addedAt: now,
        });
        ledger.tasks.insert({
          id,
          repoId: "rrrrrrrrrr",
          title: "left over from last boot",
          prompt: "p",
          profileId: PROFILE,
          worktreePath: null,
          branch: null,
          status: "running",
          origin: "agn",
          createdAt: now,
          updatedAt: now,
        });
        ledger.tasks.setSession(id, {
          harness: "claude-code",
          sessionId: null,
          tmuxSession: `agn-${id}`,
          tmuxSocket: null,
          cwd: "/tmp",
          lastSeenAt: now,
        });
      },
    });
    try {
      await waitFor(
        "the start-up reconcile to stop it",
        () => seeded.ledger.tasks.get(id)?.status === "stopped",
      );
    } finally {
      await seeded.close();
    }
  });
});
