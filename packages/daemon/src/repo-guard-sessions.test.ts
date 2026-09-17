import { rename } from "node:fs/promises";
import { join } from "node:path";
import type {
  ApiErrorBody,
  HandoffTaskResponse,
  Repo,
  ResumeTaskResponse,
  Task,
  TaskResponse,
} from "@agnostic/core";
import * as core from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeSessions, fakeSessions } from "./test-adopt.js";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

async function post(daemon: TestDaemon, path: string, body?: Record<string, unknown>) {
  return daemon.request(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

async function refusal(response: Response): Promise<ApiErrorBody["error"]> {
  expect(response.status).toBe(409);
  return ((await response.json()) as ApiErrorBody).error;
}

async function runTask(daemon: TestDaemon, repo: Repo): Promise<Response> {
  return post(daemon, `/repos/${repo.id}/tasks`, { prompt: "add a --verbose flag" });
}

async function startedIn(daemon: TestDaemon, repo: Repo): Promise<Task> {
  const response = await runTask(daemon, repo);
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

/** Stops the task the way `agn stop` does, so the repo has nothing live holding it open. */
async function stop(daemon: TestDaemon, task: Task): Promise<void> {
  expect((await post(daemon, `/tasks/${task.id}/stop`)).status).toBe(200);
  await waitFor("the stopped task to be terminal", () => {
    return daemon.ledger.tasks.get(task.id)?.status === "stopped";
  });
}

describe("a closed repo takes no new sessions", () => {
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

  async function expectClosed(response: Response, repo: Repo): Promise<void> {
    const error = await refusal(response);
    expect(error.code).toBe("repo-closed");
    expect(error.message).toBe(`repo ${repo.name} is closed`);
    expect(error.hint).toBe(`Run \`agn repo open ${repo.id}\` first.`);
  }

  async function setStatus(repo: Repo, action: "close" | "open"): Promise<void> {
    expect((await post(daemon, `/repos/${repo.id}/${action}`)).status).toBe(200);
  }

  it("refuses a run, and starts one once the repo is open again", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await setStatus(repo, "close");

    await expectClosed(await runTask(daemon, repo), repo);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toEqual([]);

    await setStatus(repo, "open");
    expect((await startedIn(daemon, repo)).status).toBe("running");
  });

  it("refuses a resume, and resumes once the repo is open again", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await startedIn(daemon, repo);
    await stop(daemon, task);
    await setStatus(repo, "close");

    await expectClosed(await post(daemon, `/tasks/${task.id}/resume`), repo);

    await setStatus(repo, "open");
    const response = await post(daemon, `/tasks/${task.id}/resume`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as ResumeTaskResponse).task.status).toBe("running");
  });

  it("refuses a handoff, and hands off once the repo is open again", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await startedIn(daemon, repo);
    await stop(daemon, parent);
    await setStatus(repo, "close");

    await expectClosed(
      await post(daemon, `/tasks/${parent.id}/handoff`, { profile: PROFILE }),
      repo,
    );

    await setStatus(repo, "open");
    const response = await post(daemon, `/tasks/${parent.id}/handoff`, { profile: PROFILE });
    expect(response.status).toBe(201);
    const body = (await response.json()) as HandoffTaskResponse;
    expect(body.task.parentTaskId).toBe(parent.id);
  });

  it("refuses an adopt, and adopts once the repo is open again", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    await setStatus(repo, "close");

    await expectClosed(
      await post(daemon, `/repos/${repo.id}/adopt`, { path: repo.path, pid }),
      repo,
    );

    await setStatus(repo, "open");
    const response = await post(daemon, `/repos/${repo.id}/adopt`, { path: repo.path, pid });
    expect(response.status).toBe(201);
    expect(((await response.json()) as TaskResponse).task.origin).toBe("adopted");
  });
});

describe("a removed repo takes no new sessions", () => {
  let daemon: TestDaemon;

  beforeEach(async () => {
    daemon = await createTestDaemon({ tmux: true });
  });

  afterEach(async () => {
    await daemon.close();
  });

  it("refuses a run, naming the agn add hint, and starts once added back", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    daemon.ledger.repos.update(repo.id, { status: "removed" });

    const error = await refusal(await runTask(daemon, repo));
    expect(error.code).toBe("repo-removed");
    expect(error.hint).toBe(`Run \`agn add ${repo.path}\` to register it again.`);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toEqual([]);

    daemon.ledger.repos.update(repo.id, { status: "active" });
    expect((await startedIn(daemon, repo)).status).toBe("running");
  });
});

describe("a repo whose folder is missing takes no new sessions", () => {
  let daemon: TestDaemon;

  beforeEach(async () => {
    daemon = await createTestDaemon({ tmux: true });
  });

  afterEach(async () => {
    await daemon.close();
  });

  async function expectMissing(response: Response, repo: Repo): Promise<void> {
    const error = await refusal(response);
    expect(error.code).toBe("repo-missing");
    expect(error.message).toBe(`the folder for repo ${repo.name} is not there: ${repo.path}`);
    expect(error.hint).toBe(`Mount or restore it, or run \`agn repo remove ${repo.id}\`.`);
  }

  it("refuses a run for a git repo, spawns nothing, and starts once mounted back", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const away = `${repo.path}-away`;
    await rename(repo.path, away);
    const runSpy = vi.spyOn(core, "run");
    const spawnSpy = vi.spyOn(core, "spawn");

    await expectMissing(await runTask(daemon, repo), repo);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toEqual([]);
    expect(runSpy).not.toHaveBeenCalled();
    expect(spawnSpy).not.toHaveBeenCalled();
    runSpy.mockRestore();
    spawnSpy.mockRestore();

    await rename(away, repo.path);
    expect((await startedIn(daemon, repo)).status).toBe("running");
  });

  it("refuses a resume for a git repo", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await startedIn(daemon, repo);
    await stop(daemon, task);
    const away = `${repo.path}-away`;
    await rename(repo.path, away);

    await expectMissing(await post(daemon, `/tasks/${task.id}/resume`), repo);

    await rename(away, repo.path);
  });

  it("refuses a handoff for a folder repo", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const parent = await startedIn(daemon, repo);
    await stop(daemon, parent);
    const away = `${repo.path}-away`;
    await rename(repo.path, away);

    await expectMissing(
      await post(daemon, `/tasks/${parent.id}/handoff`, { profile: PROFILE }),
      repo,
    );

    await rename(away, repo.path);
  });

  it("refuses an adopt for a folder repo, with no session listed", async () => {
    const repo = await daemon.addRepo({ git: false });
    const away = `${repo.path}-away`;
    await rename(repo.path, away);

    await expectMissing(
      await post(daemon, `/repos/${repo.id}/adopt`, { path: repo.path, pid: 4242 }),
      repo,
    );

    await rename(away, repo.path);
  });
});
