import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AttachResponse,
  agPaths,
  parseTaskNote,
  type Repo,
  type Task,
  type TaskListResponse,
  type TaskResponse,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errorOf, type FakeSessions, fakeSessions, seedAdopted } from "./test-adopt.js";
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

describe("POST /repos/:id/adopt", () => {
  it("registers a session started outside agn, with no worktree and the branch it is on", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);

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
    // A process agn already watches is not offered again; it is named as the task it became.
    const listed = await agents.list(repo, repo.path);
    expect(listed.status).toBe(409);
    expect((await errorOf(listed)).error.message).toContain(task.id);

    const attach = await daemon.request(`/tasks/${task.id}/attach`);
    expect(attach.status).toBe(409);
    expect((await errorOf(attach)).error.code).toBe("session-not-attachable");
  });

  it("gives a tmux session for an agent adopted from under the test socket, and attach works", async () => {
    const repo = await daemon.addRepo();
    await agents.underTmux(join(repo.path, "sub"), "manual");
    const [session] = await agents.waitForCount(repo, repo.path, 1);
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

  it("adopts the session even when its note cannot be written, and says so in the log", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    // A file where the notes directory belongs: the row is already written when this fails, so the
    // adopt has to stand.
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(agPaths(repo.path).tasksDir, "not a directory", "utf8");

    const task = await adopted(repo, { path: repo.path, pid });
    expect(task.status).toBe("running");
    expect(await daemon.readLog()).toContain(`task note not written taskId=${task.id}`);
  });

  it("refuses a pid that is not one of the sessions it listed", async () => {
    const repo = await daemon.addRepo();
    await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);

    const response = await adopt(repo, { path: repo.path, pid: process.pid });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).error.code).toBe("adopt-pid-not-found");
  });

  it("names the task a session already belongs to, so a retry is not a detection failure", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    const task = await adopted(repo, { path: repo.path, pid });

    const response = await adopt(repo, { path: repo.path, pid });

    expect(response.status).toBe(409);
    const body = await errorOf(response);
    expect(body.error.code).toBe("adopt-already-adopted");
    expect(body.error.message).toContain(task.id);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toHaveLength(1);
  });

  it("names the task that owns a pid detection cannot see, rather than calling it missing", async () => {
    const repo = await daemon.addRepo();
    const cwd = join(repo.path, "sub");
    await mkdir(cwd, { recursive: true });
    // Alive, and never a harness to the scan: the pid is only ever found through the ledger.
    const task = seedAdopted(daemon, repo, process.pid, cwd);

    const response = await adopt(repo, { path: repo.path, pid: process.pid });

    expect(response.status).toBe(409);
    const body = await errorOf(response);
    expect(body.error.code).toBe("adopt-already-adopted");
    expect(body.error.message).toContain(task.id);
  });

  it("registers a pid once when two adopts of it arrive together", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);

    // Both read the candidate list before either writes; only the transaction can separate them.
    const [first, second] = await Promise.all([
      adopt(repo, { path: repo.path, pid }),
      adopt(repo, { path: repo.path, pid }),
    ]);
    const codes = [first.status, second.status].sort();
    expect(codes).toEqual([201, 409]);
    expect(daemon.ledger.tasks.list({ repoId: repo.id })).toHaveLength(1);
  });

  it("stops an adopted task when the process it watches goes away", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    const task = await adopted(repo, { path: repo.path, pid });

    process.kill(pid, "SIGKILL");
    await waitFor("the adopted task to be stopped", async () => {
      const { tasks } = (await (await daemon.request("/tasks")).json()) as TaskListResponse;
      return tasks.find((row) => row.id === task.id)?.status === "stopped";
    });
  });

  it("closes an adopted task with a duration and no diff fields, since it has no branch of agn's", async () => {
    const repo = await daemon.addRepo();
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
    const task = await adopted(repo, { path: repo.path, pid });

    process.kill(pid, "SIGKILL");
    // Liveness for a process outside tmux is only reconciled on a read; `GET /tasks` is that read.
    await waitFor("the adopted task to close with an outcome", async () => {
      await daemon.request("/tasks");
      return daemon.ledger.outcomes.get(task.id) !== null;
    });

    expect(daemon.ledger.tasks.get(task.id)?.baseCommit).toBeNull();
    const outcome = daemon.ledger.outcomes.get(task.id);
    expect(outcome?.durationSec).toBeGreaterThanOrEqual(0);
    expect(outcome?.tokens).toBe(0);
    // No test_command is configured, and an adopted task never gets a testsBefore baseline.
    expect(outcome?.testsBefore).toBeNull();
    expect(outcome?.testsAfter).toBeNull();
    expect(outcome?.accepted).toBeNull();
    expect(outcome?.reverted).toBeNull();
    expect(outcome?.agentLines).toBeNull();
    expect(outcome?.humanChangedLines).toBeNull();
    expect(outcome?.humanEditRatio).toBeNull();
  });

  it("holds a folder repo the way a launched task does", async () => {
    const repo = await daemon.addRepo({ git: false });
    const pid = await agents.outsideTmux(join(repo.path, "sub"));
    await agents.waitForCount(repo, repo.path, 1);
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
