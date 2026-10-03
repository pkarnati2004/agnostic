import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AskCommitResponse,
  agPaths,
  defaultCommitPrompt,
  newId,
  type Repo,
  type Task,
} from "@agnostic/core";
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

async function asked(id: string): Promise<AskCommitResponse> {
  const response = await post(`/tasks/${id}/commit`);
  expect(response.status).toBe(200);
  return (await response.json()) as AskCommitResponse;
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

/** The repo's own prompt, written where the launch and the ask both read it from. */
async function writeCommitPrompt(repo: Repo, body: string): Promise<void> {
  const paths = agPaths(repo.path);
  await mkdir(paths.promptsDir, { recursive: true });
  await writeFile(paths.commitPromptMd, body, "utf8");
}

/** Stops the task the way `agn stop` does, so the pane is gone before the ask. */
async function stopTask(task: Task): Promise<void> {
  expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
  await waitFor(
    "the stopped task to have no live session",
    () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
  );
}

/** Marks the worktree cleaned the way `agn clean --force` does: the branch is kept. */
async function cleanTask(task: Task): Promise<void> {
  expect((await post(`/tasks/${task.id}/clean`, { force: true })).status).toBe(200);
}

/** A task row the way an adopt writes one: a session agn watches and never typed into. */
function seedAdopted(repo: Repo, opts: { cwd: string; branch: string }): Task {
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

describe("POST /tasks/:id/commit", () => {
  it("types agn's own prompt into a live session", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);

    const body = await asked(task.id);

    expect(body.via).toBe("live");
    expect(body.prompt).toBe(defaultCommitPrompt(task.branch ?? ""));
    // The launch prompt carries the same text, so the typed line is what this checks: tmux frames
    // a paste, which is why the marker sits between the log's prefix and the prompt.
    const log = await agentLog("line: ");
    expect(log).toMatch(/line: .*Commit your work on/);
  });

  it("sends the repo's own file when it has one, and agn's default nowhere near it", async () => {
    const repo = await repoWithConfig(daemon);
    await writeCommitPrompt(repo, "Run `/land`: it commits and stops there.\n\n");
    const task = await startTask(daemon, repo);

    const body = await asked(task.id);

    expect(body.prompt).toBe("Run `/land`: it commits and stops there.");
    const log = await agentLog("Run `/land`: it commits and stops there.");
    expect(log).not.toContain("Commit your work on");
  });

  it("resumes fresh with the prompt under its own heading, once no session remains", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    await stopTask(task);

    const body = await asked(task.id);

    expect(body.via).toBe("fresh");
    const log = await agentLog("## Commit");
    expect(log).toContain(body.prompt);
  });

  it("resumes natively when the harness still holds the session", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const session = task.session;
    if (session === undefined) {
      throw new Error("the launched task has no session");
    }
    daemon.ledger.tasks.setSession(task.id, { ...session, sessionId: "sess-77" });
    await seedTranscript(daemon, "sess-77");
    await stopTask(task);

    const body = await asked(task.id);

    expect(body.via).toBe("native");
    const log = await agentLog("--resume sess-77");
    expect(log.indexOf(body.prompt)).toBeGreaterThan(log.indexOf("ready"));
  });

  it("refuses a folder workspace, which has no branch to commit on", async () => {
    const folder = await repoWithConfig(daemon, { git: false });
    const task = await startTask(daemon, folder);

    const error = await refused(await post(`/tasks/${task.id}/commit`), 409);

    expect(error.code).toBe("repo-not-git");
    expect(error.message).toContain("nothing to commit on");
  });

  it("refuses a queued task the daemon never got to start, which has no branch yet", async () => {
    const repo = await repoWithConfig(daemon);
    const now = new Date().toISOString();
    const queued = daemon.ledger.tasks.insert({
      id: newId(),
      repoId: repo.id,
      title: "left queued",
      prompt: "finish the job",
      profileId: "claude-code:default:native",
      worktreePath: `${repo.path}-worktree`,
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      compareId: null,
      createdAt: now,
      updatedAt: now,
    });

    const error = await refused(await post(`/tasks/${queued.id}/commit`), 409);

    expect(error.code).toBe("repo-not-git");
    expect(error.message).toContain("nothing to commit on");
  });

  it("refuses a cleaned worktree, and the hint names agn resume", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    await stopTask(task);
    await cleanTask(task);

    const error = await refused(await post(`/tasks/${task.id}/commit`), 409);

    expect(error.code).toBe("worktree-cleaned");
    expect(error.hint).toBe(`Run \`agn resume ${task.id}\` first: it rebuilds the worktree.`);
  });

  it("refuses an adopted session started outside tmux, quoting the prompt in the hint", async () => {
    const repo = await repoWithConfig(daemon);
    const parent = await mkdtemp(join(tmpdir(), "agn-commit-topic-"));
    const sub = join(parent, "topic");
    await gitIn(repo.path, ["worktree", "add", "-b", "topic", sub]);
    const adopted = seedAdopted(repo, { cwd: sub, branch: "topic" });

    const error = await refused(await post(`/tasks/${adopted.id}/commit`), 409);

    expect(error.code).toBe("session-not-attachable");
    expect(error.hint).toContain("Commit your work on `topic`");
  });

  it("runs no add, commit or push of its own", async () => {
    const repo = await repoWithConfig(daemon);
    const task = await startTask(daemon, repo);
    const git: GitRecorder = await recordGit();
    try {
      expect((await asked(task.id)).via).toBe("live");
      const calls = await git.calls();
      for (const verb of ["add", "commit", "push"]) {
        expect(calls.some((argv) => argv.includes(verb))).toBe(false);
      }
    } finally {
      git.restore();
    }
  });
});
