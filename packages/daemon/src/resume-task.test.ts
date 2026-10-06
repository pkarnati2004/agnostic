import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agPaths,
  newId,
  type Repo,
  type ResumeTaskResponse,
  type Task,
  type TaskResponse,
  worktreePath,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { repoWithConfig, startTask } from "./test-task-run.js";
import { seedTranscript } from "./test-transcript.js";

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

function post(path: string): Promise<Response> {
  return daemon.request(path, { method: "POST" });
}

async function resume(task: Task): Promise<ResumeTaskResponse> {
  const response = await post(`/tasks/${task.id}/resume`);
  expect(response.status).toBe(200);
  return (await response.json()) as ResumeTaskResponse;
}

/** The session id a hook would have captured, put on the row the way the receiver puts it there. */
function recordSession(task: Task, sessionId: string): void {
  const session = task.session;
  if (session === undefined) {
    throw new Error("the launched task has no session");
  }
  daemon.ledger.tasks.setSession(task.id, { ...session, sessionId });
}

/** Stops the session the way `agn stop` does, so the pane is gone before the resume. */
async function stop(task: Task): Promise<void> {
  expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
  await waitFor("the stopped task to have no live session", async () => {
    const { task: current } = (await (
      await daemon.request(`/tasks/${task.id}`)
    ).json()) as TaskResponse;
    return current.status === "stopped";
  });
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

describe("POST /tasks/:id/resume", () => {
  it("attaches a session that is still running, and corrects a stale status", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    daemon.ledger.tasks.setStatus(task.id, "stopped");

    const resumed = await resume(task);
    expect(resumed.via).toBe("live");
    expect(resumed.recreatedFrom).toBeNull();
    expect(resumed.task.status).toBe("running");
    expect(resumed.task.session?.tmuxSession).toBe(task.session?.tmuxSession);
    expect(resumed.attach.argv).toContain(`agn-${task.id}`);
  });

  it("hands a recorded session id back to the harness and keeps it", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    recordSession(task, "sess-42");
    // The harness still holds that conversation, which is what the daemon checks for first.
    await seedTranscript(daemon, "sess-42");
    await stop(task);

    const resumed = await resume(task);
    expect(resumed.via).toBe("native");
    expect(resumed.recreatedFrom).toBeNull();
    expect(resumed.task.status).toBe("running");
    expect(resumed.task.session?.sessionId).toBe("sess-42");
    expect(resumed.task.session?.tmuxSession).toBe(`agn-${task.id}`);
    const log = await agentLog("--resume sess-42");
    // Native resume carries no prompt: the harness reopens the conversation it already has.
    expect(log).toContain("--resume sess-42");
  });

  it("starts fresh when the harness no longer holds the recorded conversation", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    // An id no transcript carries: handed back, it would kill the task with the harness's error.
    recordSession(task, "sess-gone");
    await stop(task);
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(join(agPaths(repo.path).dir, "decisions.md"), "no transcript marker\n");

    const resumed = await resume(task);
    expect(resumed.via).toBe("fresh");
    expect(resumed.task.session?.sessionId).toBeNull();
    const log = await agentLog("no transcript marker");
    expect(log).toContain(`# Task ${task.id}`);
    expect(log).not.toContain("--resume");
  });

  // Root reads every directory whatever its mode, so there is no unreadable tree to make there.
  it.skipIf(process.getuid?.() === 0)(
    "hands the id back when the transcript tree cannot be read at all",
    async () => {
      const repo = await daemon.addRepo({ defaultProfile: PROFILE });
      const task = await runTask(repo);
      recordSession(task, "sess-unreadable");
      await stop(task);
      const root = join(daemon.home, ".claude", "projects");
      await mkdir(root, { recursive: true });
      await chmod(root, 0o000);

      try {
        // Absence of evidence is not evidence of absence: a good id is worth a conversation, and a
        // wrong native attempt costs one relaunch.
        const resumed = await resume(task);
        expect(resumed.via).toBe("native");
        expect(resumed.task.session?.sessionId).toBe("sess-unreadable");
        expect(await agentLog("--resume sess-unreadable")).toContain("--resume sess-unreadable");
      } finally {
        await chmod(root, 0o700);
      }
    },
  );

  it("starts fresh with the task context when no session id was ever captured", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    await stop(task);
    // Written between the two launches, so only the resumed prompt can contain it.
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(join(agPaths(repo.path).dir, "decisions.md"), "resume marker line\n");

    const resumed = await resume(task);
    expect(resumed.via).toBe("fresh");
    expect(resumed.task.session?.sessionId).toBeNull();
    expect(await agentLog("resume marker line")).toContain(`# Task ${task.id}`);
  });

  it("prepares and launches a task the daemon never got to start", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const id = newId();
    const now = new Date().toISOString();
    const queued = daemon.ledger.tasks.insert({
      id,
      repoId: repo.id,
      title: "left queued",
      prompt: "finish the job",
      profileId: PROFILE,
      worktreePath: worktreePath(daemon.paths, repo.id, id),
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      compareId: null,
      createdAt: now,
      updatedAt: now,
    });

    const resumed = await resume(queued);
    expect(resumed.via).toBe("fresh");
    expect(resumed.task.status).toBe("running");
    expect(resumed.task.branch).toBe(`agn/left-queued-${id}`);
    expect(await agentLog("ready cwd=")).toContain(queued.worktreePath ?? "no worktree");
  });

  it("rebuilds a worktree that was removed by hand, from the branch that outlived it", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    await stop(task);
    await rm(task.worktreePath ?? "", { recursive: true, force: true });

    const resumed = await resume(task);
    expect(resumed.recreatedFrom).toBe(task.branch);
    expect(resumed.task.worktreePath).toBe(task.worktreePath);
  });

  it("says the repo folder is gone when a folder task's own directory has vanished", async () => {
    const repo = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const task = await runTask(repo);
    await stop(task);
    await rm(repo.path, { recursive: true, force: true });

    const response = await post(`/tasks/${task.id}/resume`);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; hint: string } };
    expect(body.error.code).toBe("repo-missing");
    expect(body.error.hint).toBe(`Mount or restore it, or run \`agn repo remove ${repo.id}\`.`);
  });

  it("waits for the close work of the stop before it starts the harness again", async () => {
    // The close work runs this command in the worktree, and the resume launches an agent into the
    // same directory: the stop answers first, the resume behind it does not.
    const repo = await repoWithConfig(daemon, { testCommand: "sleep 2" });
    const task = await startTask(daemon, repo, { skipTests: true });
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    expect(daemon.ledger.outcomes.get(task.id)).toBeNull();

    const resumed = await resume(task);

    expect(resumed.task.status).toBe("running");
    expect(daemon.ledger.outcomes.get(task.id)?.durationSec).toBeGreaterThan(0);
  });

  it("still reaches a terminal status once a resumed session exits on its own", async () => {
    const repo = await daemon.addRepo();
    const response = await daemon.request(`/repos/${repo.id}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "add a --verbose flag", profile: "other:quitter" }),
    });
    expect(response.status).toBe(201);
    const task = ((await response.json()) as TaskResponse).task;
    // Read from the ledger directly, the way task-lifecycle.test.ts does: a GET reconciles before
    // it answers (ADR 014), and polling through the route would race that liveness check against
    // the exit watcher's own file-based detection of the very same exit.
    await waitFor(
      "the first run to finish on its own",
      () => daemon.ledger.tasks.get(task.id)?.status === "done",
    );

    const resumed = await resume(task);
    // The "other:" harness has no resume route (ADR 008), so this can only be fresh.
    expect(resumed.via).toBe("fresh");
    expect(resumed.task.status).toBe("running");
    await waitFor(
      "the resumed session to finish on its own",
      () => daemon.ledger.tasks.get(task.id)?.status === "done",
    );
  });
});

describe("POST /tasks/:id/resume in a folder repo", () => {
  it("refuses while another task holds the folder, and allows it once that one ends", async () => {
    const folder = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const first = await runTask(folder);
    await stop(first);
    const second = await runTask(folder);

    // ADR 001: one working tree, one task - a resume is a second agent in the same directory.
    const refused = await post(`/tasks/${first.id}/resume`);
    expect(refused.status).toBe(409);
    const body = (await refused.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("folder-busy");
    expect(body.error.message).toBe(
      "folder repos run one task at a time; git init to run tasks in parallel.",
    );
    expect(daemon.ledger.tasks.get(first.id)?.status).toBe("stopped");

    await stop(second);
    const resumed = await resume(first);
    expect(resumed.via).toBe("fresh");
    expect(resumed.task.status).toBe("running");
  });
});
