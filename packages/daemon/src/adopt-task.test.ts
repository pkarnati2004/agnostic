import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AttachResponse,
  agPaths,
  type DetectedHarness,
  parseTaskNote,
  type Repo,
  run,
  type SessionsResponse,
  spawn,
  type Task,
  type TaskListResponse,
  type TaskResponse,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const FAKE_AGENT = fileURLToPath(new URL("../../../tests/fixtures/fake-agent.sh", import.meta.url));

let daemon: TestDaemon;
let agents: ReturnType<typeof spawn>[] = [];

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  agents = [];
});

afterEach(async () => {
  for (const agent of agents) {
    agent.kill("SIGKILL");
  }
  await Promise.allSettled(agents);
  await daemon.close();
});

/** ps reports the script's own name, so the fake agent is copied to the name detection matches. */
async function harnessNamed(name: string): Promise<string> {
  const bin = join(daemon.paths.home, "detect-bin");
  await mkdir(bin, { recursive: true });
  const path = join(bin, name);
  await copyFile(FAKE_AGENT, path);
  await chmod(path, 0o755);
  return path;
}

async function startOutsideTmux(cwd: string, args: string[] = []): Promise<number> {
  await mkdir(cwd, { recursive: true });
  const agent = spawn(await harnessNamed("claude"), args, {
    cwd,
    env: daemon.launch?.env ?? {},
    inheritEnv: false,
  });
  agents.push(agent);
  return agent.pid ?? 0;
}

async function startUnderTmux(cwd: string, session: string): Promise<void> {
  await mkdir(cwd, { recursive: true });
  await run(
    "tmux",
    [
      "-L",
      daemon.launch?.socketName ?? "",
      "new-session",
      "-d",
      "-s",
      session,
      "-c",
      cwd,
      await harnessNamed("claude"),
    ],
    { env: daemon.launch?.env ?? {}, inheritEnv: false },
  );
}

async function sessionsUnder(repo: Repo, path: string): Promise<DetectedHarness[]> {
  const response = await daemon.request(
    `/repos/${repo.id}/sessions?path=${encodeURIComponent(path)}`,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as SessionsResponse).sessions;
}

function adopt(repo: Repo, body: Record<string, unknown>): Promise<Response> {
  return daemon.request(`/repos/${repo.id}/adopt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function adopted(repo: Repo, body: Record<string, unknown>): Promise<Task> {
  const response = await adopt(repo, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function errorOf(response: Response): Promise<{ error: { code: string; message: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

describe("GET /repos/:id/sessions", () => {
  it("lists the agents running under a path, in tmux or not, and drops one-shots", async () => {
    const repo = await daemon.addRepo();
    const bare = await startOutsideTmux(join(repo.path, "sub"));
    await startOutsideTmux(join(repo.path, "sub"), ["-p", "one shot"]);
    await startUnderTmux(join(repo.path, "other"), "manual");

    const sessions = await waitForSessions(repo, repo.path, 2);
    const outside = sessions.find((session) => session.pid === bare);
    const inside = sessions.find((session) => session.tmux !== null);
    expect(outside?.harness).toBe("claude-code");
    expect(outside?.tmux).toBeNull();
    expect(inside?.tmux?.session).toBe("manual");
    expect(inside?.tmux?.socket).toBe(daemon.launch?.socketName);
  });

  it("refuses a path that is not inside the repo", async () => {
    const repo = await daemon.addRepo();
    const response = await daemon.request(
      `/repos/${repo.id}/sessions?path=${encodeURIComponent(daemon.paths.home)}`,
    );
    expect(response.status).toBe(400);
    expect((await errorOf(response)).error.code).toBe("path-outside-repo");
  });
});

describe("POST /repos/:id/adopt", () => {
  it("registers a session started outside agn, with no worktree and the branch it is on", async () => {
    const repo = await daemon.addRepo();
    const pid = await startOutsideTmux(join(repo.path, "sub"));
    await waitForSessions(repo, repo.path, 1);

    const task = await adopted(repo, { path: repo.path, pid });
    expect(task.origin).toBe("adopted");
    expect(task.status).toBe("running");
    expect(task.worktreePath).toBeNull();
    expect(task.branch).toBe("main");
    expect(task.profileId).toBe("claude-code:default:native");
    expect(task.title).toContain("adopted claude-code session in sub");
    expect(task.session?.pid).toBe(pid);
    expect(task.session?.tmuxSession).toBeNull();
    const events = daemon.ledger.events.forTask(task.id);
    expect(events.map((event) => event.kind)).toEqual([
      "task.created",
      "task.adopted",
      "session.captured",
    ]);
    const adoptedPayload = events[1]?.payload as { pid: number; cwd: string };
    expect(adoptedPayload.pid).toBe(pid);
    expect(adoptedPayload.cwd).toBe(task.session?.cwd);
    expect(adoptedPayload.cwd).toContain("sub");
    const note = parseTaskNote(
      await readFile(join(agPaths(repo.path).tasksDir, `${task.id}.md`), "utf8"),
    );
    expect(note.spec).toBe("adopted from running session");
    // A process agn already watches is not offered again.
    expect(await sessionsUnder(repo, repo.path)).toHaveLength(0);

    const attach = await daemon.request(`/tasks/${task.id}/attach`);
    expect(attach.status).toBe(409);
    expect((await errorOf(attach)).error.code).toBe("session-not-attachable");
  });

  it("gives a tmux session for an agent adopted from under the test socket, and attach works", async () => {
    const repo = await daemon.addRepo();
    await startUnderTmux(join(repo.path, "sub"), "manual");
    const [session] = await waitForSessions(repo, repo.path, 1);
    if (session === undefined) {
      throw new Error("expected the tmux session to be found");
    }

    const task = await adopted(repo, { path: repo.path, pid: session.pid });
    expect(task.session?.tmuxSession).toBe("manual");
    expect(task.session?.tmuxSocket).toBe(daemon.launch?.socketName);

    const attach = await daemon.request(`/tasks/${task.id}/attach`);
    expect(attach.status).toBe(200);
    const body = (await attach.json()) as AttachResponse;
    expect(body.attach.argv).toContain("manual");
  });

  it("refuses a pid that is not one of the sessions it listed", async () => {
    const repo = await daemon.addRepo();
    await startOutsideTmux(join(repo.path, "sub"));
    await waitForSessions(repo, repo.path, 1);

    const response = await adopt(repo, { path: repo.path, pid: process.pid });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).error.code).toBe("adopt-pid-not-found");
  });

  it("registers a pid once when two adopts of it arrive together", async () => {
    const repo = await daemon.addRepo();
    const pid = await startOutsideTmux(join(repo.path, "sub"));
    await waitForSessions(repo, repo.path, 1);

    // Both read the candidate list before either writes; only the transaction can separate them.
    const [first, second] = await Promise.all([
      adopt(repo, { path: repo.path, pid }),
      adopt(repo, { path: repo.path, pid }),
    ]);
    const codes = [first.status, second.status].sort();
    expect(codes).toEqual([201, 400]);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toHaveLength(1);
  });

  it("stops an adopted task when the process it watches goes away", async () => {
    const repo = await daemon.addRepo();
    const pid = await startOutsideTmux(join(repo.path, "sub"));
    await waitForSessions(repo, repo.path, 1);
    const task = await adopted(repo, { path: repo.path, pid });

    process.kill(pid, "SIGKILL");
    await waitFor("the adopted task to be stopped", async () => {
      const { tasks } = (await (await daemon.request("/tasks")).json()) as TaskListResponse;
      return tasks.find((row) => row.id === task.id)?.status === "stopped";
    });
  });

  it("holds a folder workspace the way a launched task does", async () => {
    const repo = await daemon.addRepo({ git: false });
    const pid = await startOutsideTmux(join(repo.path, "sub"));
    await waitForSessions(repo, repo.path, 1);
    const task = await adopted(repo, { path: repo.path, pid });
    expect(task.branch).toBeNull();

    const response = await daemon.request(`/repos/${repo.id}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "something else", profile: "claude-code" }),
    });
    expect(response.status).toBe(409);
    expect((await errorOf(response)).error.code).toBe("folder-busy");
  });
});

/** Detection reads the process table, so a just-spawned agent takes a moment to turn up. */
async function waitForSessions(
  repo: Repo,
  path: string,
  count: number,
): Promise<DetectedHarness[]> {
  await waitFor(
    `${count} session(s) under ${path}`,
    async () => (await sessionsUnder(repo, path)).length === count,
  );
  return await sessionsUnder(repo, path);
}
