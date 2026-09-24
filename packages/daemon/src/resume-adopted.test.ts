import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type Repo, type ResumeTaskResponse, type Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { gitIn } from "./test-task-run.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

/** A task row the way an adopt writes one: a session agn watches, with no worktree of its own. */
function seedAdopted(repo: Repo, opts: { cwd: string; branch: string }): Task {
  const now = new Date().toISOString();
  const task = daemon.ledger.tasks.insert({
    id: newId(),
    repoId: repo.id,
    title: "adopted session",
    prompt: "",
    profileId: PROFILE,
    worktreePath: null,
    branch: opts.branch,
    status: "stopped",
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

async function resume(task: Task): Promise<ResumeTaskResponse> {
  const response = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
  expect(response.status).toBe(200);
  return (await response.json()) as ResumeTaskResponse;
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

describe("POST /tasks/:id/resume for an adopted task", () => {
  it("leaves the commit section out on a fresh resume: an adopted task has no worktree of agn's", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const cwd = await mkdtemp(join(tmpdir(), "agn-resume-adopted-"));
    await gitIn(repo.path, ["worktree", "add", "-b", "adopted-topic", cwd]);
    const task = seedAdopted(repo, { cwd, branch: "adopted-topic" });

    const resumed = await resume(task);

    expect(resumed.via).toBe("fresh");
    const log = await agentLog(`# Task ${task.id}`);
    expect(log).not.toContain("Before you finish");
    expect(log).not.toContain("Commit your work on");
  });
});
