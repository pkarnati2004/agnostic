import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isProcessAlive, type Repo, spawn, type Task, type TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeSessions, fakeSessions, seedAdopted } from "./test-adopt.js";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

let daemon: TestDaemon;
let agents: FakeSessions;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  agents = fakeSessions(daemon);
});

afterEach(async () => {
  await agents.killAll();
  await daemon.close();
});

async function adopt(repo: Repo, pid: number): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/adopt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: repo.path, pid }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

async function stop(task: Task): Promise<Task> {
  const response = await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" });
  expect(response.status).toBe(200);
  return ((await response.json()) as TaskResponse).task;
}

describe("stopping an adopted task", () => {
  it("ends the process it watches, since there is no pane of agn's to kill", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    const task = await adopt(repo, pid);

    expect((await stop(task)).status).toBe("stopped");
    await waitFor("the adopted agent to go", () => !isProcessAlive(pid));
  });

  it("kills an agent that ignores SIGTERM once the grace period is over", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"), ["--ignore-term"]);
    await agents.waitForCount(repo, repo.path, 1);
    const task = await adopt(repo, pid);

    expect((await stop(task)).status).toBe("stopped");
    await waitFor("the agent that ignored SIGTERM to go", () => !isProcessAlive(pid));
  }, 30_000);

  it("leaves a pid that is running another program alone, and still stops the task", async () => {
    const repo = await daemon.addRepo();
    const cwd = join(repo.path, "sub");
    await mkdir(cwd, { recursive: true });
    // What a recycled pid looks like: alive, and nothing agn ever adopted.
    const stranger = spawn("sleep", ["30"], { cwd });
    const pid = stranger.pid ?? 0;
    const task = seedAdopted(daemon, repo, pid, cwd);

    expect((await stop(task)).status).toBe("stopped");
    expect(isProcessAlive(pid)).toBe(true);
    await waitFor("the daemon to say why it signalled nothing", async () =>
      (await daemon.readLog()).includes("adopted process not signalled"),
    );

    stranger.kill("SIGKILL");
    await stranger.catch(() => undefined);
  });

  it("marks a task whose process is already gone stopped, without an error", async () => {
    const repo = await daemon.addRepo();
    const cwd = join(repo.path, "sub");
    await mkdir(cwd, { recursive: true });
    const pid = await agents.outsideTmux(cwd);
    await agents.killAll();
    await waitFor("the agent to go", () => !isProcessAlive(pid));
    const task = seedAdopted(daemon, repo, pid, cwd);

    expect((await stop(task)).status).toBe("stopped");
  });
});
