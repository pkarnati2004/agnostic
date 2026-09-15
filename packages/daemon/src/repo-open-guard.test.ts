import { join } from "node:path";
import type {
  ApiErrorBody,
  HandoffTaskResponse,
  Repo,
  ResumeTaskResponse,
  Task,
  TaskResponse,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertRepoOpen } from "./repo-open-guard.js";
import { type FakeSessions, fakeSessions } from "./test-adopt.js";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

const OPEN: Repo = {
  id: "r7k2m4pqrs",
  path: "/work/api",
  kind: "git",
  name: "api",
  addedAt: "2026-09-11T10:00:00.000Z",
  status: "active",
};

describe("assertRepoOpen", () => {
  it("lets an open repo through", () => {
    expect(() => assertRepoOpen(OPEN)).not.toThrow();
  });

  it("refuses a closed one, naming the repo and the command that opens it", () => {
    const closed = { ...OPEN, status: "archived" as const };
    expect(() => assertRepoOpen(closed)).toThrowError("repo api is closed");
    expect(() => assertRepoOpen(closed)).toThrowError(
      expect.objectContaining({
        code: "repo-closed",
        hint: "Run `agn repo open r7k2m4pqrs` first.",
      }),
    );
  });
});

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

  function post(path: string, body?: Record<string, unknown>): Promise<Response> {
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

  async function expectClosed(response: Response, repo: Repo): Promise<void> {
    const error = await refusal(response);
    expect(error.code).toBe("repo-closed");
    expect(error.message).toBe(`repo ${repo.name} is closed`);
    expect(error.hint).toBe(`Run \`agn repo open ${repo.id}\` first.`);
  }

  async function setStatus(repo: Repo, action: "close" | "open"): Promise<void> {
    expect((await post(`/repos/${repo.id}/${action}`)).status).toBe(200);
  }

  async function run(repo: Repo): Promise<Response> {
    return await post(`/repos/${repo.id}/tasks`, { prompt: "add a --verbose flag" });
  }

  /** Stops the task the way `agn stop` does, so the repo has nothing live holding it open. */
  async function stop(task: Task): Promise<void> {
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    await waitFor("the stopped task to be terminal", () => {
      return daemon.ledger.tasks.get(task.id)?.status === "stopped";
    });
  }

  async function startedIn(repo: Repo): Promise<Task> {
    const response = await run(repo);
    expect(response.status).toBe(201);
    return ((await response.json()) as TaskResponse).task;
  }

  it("refuses a run, and starts one once the repo is open again", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await setStatus(repo, "close");

    await expectClosed(await run(repo), repo);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toEqual([]);

    await setStatus(repo, "open");
    expect((await startedIn(repo)).status).toBe("running");
  });

  it("refuses a resume, and resumes once the repo is open again", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await startedIn(repo);
    await stop(task);
    await setStatus(repo, "close");

    await expectClosed(await post(`/tasks/${task.id}/resume`), repo);

    await setStatus(repo, "open");
    const response = await post(`/tasks/${task.id}/resume`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as ResumeTaskResponse).task.status).toBe("running");
  });

  it("refuses a handoff, and hands off once the repo is open again", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const parent = await startedIn(repo);
    await stop(parent);
    await setStatus(repo, "close");

    await expectClosed(await post(`/tasks/${parent.id}/handoff`, { profile: PROFILE }), repo);

    await setStatus(repo, "open");
    const response = await post(`/tasks/${parent.id}/handoff`, { profile: PROFILE });
    expect(response.status).toBe(201);
    const body = (await response.json()) as HandoffTaskResponse;
    expect(body.task.parentTaskId).toBe(parent.id);
  });

  it("refuses an adopt, and adopts once the repo is open again", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    await setStatus(repo, "close");

    await expectClosed(await post(`/repos/${repo.id}/adopt`, { path: repo.path, pid }), repo);

    await setStatus(repo, "open");
    const response = await post(`/repos/${repo.id}/adopt`, { path: repo.path, pid });
    expect(response.status).toBe(201);
    expect(((await response.json()) as TaskResponse).task.origin).toBe("adopted");
  });
});
