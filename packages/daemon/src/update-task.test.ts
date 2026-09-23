import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type Repo, run, type Task, type UpdateTaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { type GitRecorder, recordGit } from "./test-git-recorder.js";
import { gitIn, repoWithConfig, startTask } from "./test-task-run.js";
import { seedTranscript } from "./test-transcript.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

function post(path: string, body?: unknown): Promise<Response> {
  return daemon.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function update(id: string): Promise<Response> {
  return post(`/tasks/${id}/update`);
}

async function updated(id: string): Promise<UpdateTaskResponse> {
  const response = await update(id);
  expect(response.status).toBe(200);
  return (await response.json()) as UpdateTaskResponse;
}

type Failure = { code: string; message: string; hint: string };

async function refused(response: Response, status: number): Promise<Failure> {
  expect(response.status).toBe(status);
  return ((await response.json()) as { error: Failure }).error;
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

/** Stops the task the way `agn stop` does, so the pane is gone before the update. */
async function stopTask(task: Task): Promise<void> {
  expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
  await waitFor(
    "the stopped task to have no live session",
    () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
  );
}

/** Marks the worktree cleaned the way `agn clean --force` does: the branch is kept. */
async function cleanTask(task: Task): Promise<void> {
  const cleaned = await post(`/tasks/${task.id}/clean`, { force: true });
  expect(cleaned.status).toBe(200);
}

/** A task row the way an adopt writes one, but on the branch the test names rather than "main". */
function seedAdopted(daemon: TestDaemon, repo: Repo, opts: { cwd: string; branch: string }): Task {
  const now = new Date().toISOString();
  const task = daemon.ledger.tasks.insert({
    id: newId(),
    repoId: repo.id,
    title: "adopted session",
    prompt: "",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: opts.branch,
    status: "running",
    origin: "adopted",
    baseCommit: null,
    compareId: null,
    createdAt: now,
    updatedAt: now,
  });
  return daemon.ledger.tasks.setSession(task.id, {
    harness: "claude-code",
    sessionId: null,
    tmuxSession: null,
    tmuxSocket: null,
    launchId: null,
    pid: null,
    cwd: opts.cwd,
    lastSeenAt: now,
  });
}

describe("POST /tasks/:id/update", () => {
  it("types the prompt into a live session and answers rebase, never pushed", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);

    const body = await updated(task.id);

    expect(body.mode).toBe("rebase");
    expect(body.via).toBe("live");
    expect(body.base).toBe("main");
    expect(body.prompt).toBe(
      `Fetch \`main\`. Bring \`${task.branch}\` up to date with it by rebasing onto it ` +
        "(this branch was never pushed). Resolve conflicts. Keep the tests green. Do not push.",
    );
    const log = await agentLog(`Fetch \`main\`. Bring \`${task.branch}\` up to date`);
    expect(log).toContain("Do not push.");
  });

  it("answers merge once the branch has been pushed to a remote", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const worktree = task.worktreePath ?? "";
    const bare = await mkdtemp(join(tmpdir(), "agn-update-bare-"));
    try {
      await run("git", ["init", "-q", "--bare", "-b", "main", bare]);
      await gitIn(worktree, ["remote", "add", "origin", bare]);
      await gitIn(worktree, ["push", "-q", "--set-upstream", "origin", task.branch ?? ""]);

      const body = await updated(task.id);

      expect(body.mode).toBe("merge");
      expect(body.prompt).toContain("by merging it in (this branch was pushed)");
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("resumes fresh with the prompt as a section of the launch context, once no session remains", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    await stopTask(task);

    const body = await updated(task.id);

    expect(body.via).toBe("fresh");
    const log = await agentLog("## Bring up to date");
    expect(log).toContain("## Bring up to date");
    expect(log).toContain(body.prompt);
  });

  it("resumes natively and types the prompt in after ready, when the harness still holds the session", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const session = task.session;
    if (session === undefined) {
      throw new Error("the launched task has no session");
    }
    daemon.ledger.tasks.setSession(task.id, { ...session, sessionId: "sess-42" });
    await seedTranscript(daemon, "sess-42");
    await stopTask(task);

    const body = await updated(task.id);

    expect(body.via).toBe("native");
    const log = await agentLog("--resume sess-42");
    expect(log.indexOf("ready")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf(body.prompt)).toBeGreaterThan(log.indexOf("ready"));
  });

  it("refuses a folder workspace", async () => {
    const folder = await repoWithConfig(daemon, { git: false });
    const task = await startTask(daemon, folder);
    const error = await refused(await update(task.id), 409);
    expect(error.code).toBe("repo-not-git");
  });

  it("refuses a cleaned worktree, and the hint names agn resume", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    await stopTask(task);
    await cleanTask(task);

    const error = await refused(await update(task.id), 409);

    expect(error.code).toBe("worktree-cleaned");
    expect(error.hint).toBe(`Run \`agn resume ${task.id}\` first: it rebuilds the worktree.`);
  });

  it("refuses a branch that is what the repo branches from", async () => {
    const repo = await repoWithConfig(daemon);
    const adopted = seedAdopted(daemon, repo, { cwd: repo.path, branch: "main" });

    const error = await refused(await update(adopted.id), 409);

    expect(error.code).toBe("branch-is-base");
  });

  it("refuses an adopted session started outside tmux, quoting the prompt in the hint", async () => {
    const repo = await repoWithConfig(daemon);
    // A linked worktree, not the main checkout: the repo's own HEAD (and so its base) stays main.
    // `worktree add` creates the leaf itself, so only the parent is made ahead of it.
    const parent = await mkdtemp(join(tmpdir(), "agn-update-topic-"));
    const sub = join(parent, "topic");
    await gitIn(repo.path, ["worktree", "add", "-b", "topic", sub]);
    const adopted = seedAdopted(daemon, repo, { cwd: sub, branch: "topic" });

    const error = await refused(await update(adopted.id), 409);

    expect(error.code).toBe("session-not-attachable");
    expect(error.hint).toContain("Type the prompt into that terminal yourself:");
    expect(error.hint).toContain("Fetch `main`. Bring `topic` up to date");
  });

  it("runs no fetch, rebase, merge, pull or push while it composes and sends the prompt", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const git: GitRecorder = await recordGit();
    try {
      const body = await updated(task.id);
      expect(body.via).toBe("live");
      const calls = await git.calls();
      for (const verb of ["fetch", "rebase", "merge", "pull", "push"]) {
        expect(calls.some((argv) => argv.includes(verb))).toBe(false);
      }
    } finally {
      git.restore();
    }
  });
});
