import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Event, Repo, ResumeTaskResponse, Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { shimGit } from "./test-git-shim.js";
import { gitIn, startTask } from "./test-task-run.js";
import { seedTranscript } from "./test-transcript.js";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function repo(): Promise<Repo> {
  return await daemon.addRepo({ defaultProfile: "claude-code:default:native" });
}

function post(path: string, body?: unknown): Promise<Response> {
  return daemon.request(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

/** Run, stop, clean: the task whose worktree is gone and whose branch is not. */
async function cleanedTask(target: Repo, opts: { deleteBranch?: boolean } = {}): Promise<Task> {
  const task = await startTask(daemon, target);
  expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
  await waitFor(
    "the stopped task to have no live session",
    () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
  );
  const cleaned = await post(`/tasks/${task.id}/clean`, {
    deleteBranch: opts.deleteBranch === true,
  });
  expect(cleaned.status).toBe(200);
  expect(((await cleaned.json()) as { removed: boolean }).removed).toBe(true);
  await expect(stat(task.worktreePath ?? "")).rejects.toThrowError();
  return task;
}

async function resume(task: Task): Promise<ResumeTaskResponse> {
  const response = await post(`/tasks/${task.id}/resume`);
  expect(response.status).toBe(200);
  return (await response.json()) as ResumeTaskResponse;
}

async function refusal(task: Task): Promise<{ code: string; message: string; hint: string }> {
  const response = await post(`/tasks/${task.id}/resume`);
  expect(response.status).toBe(409);
  return ((await response.json()) as { error: { code: string; message: string; hint: string } })
    .error;
}

function eventsSince(taskId: string, from: number): Event[] {
  return daemon.ledger.events.forTask(taskId).filter((event) => event.id > from);
}

function lastEventId(taskId: string): number {
  const events = daemon.ledger.events.forTask(taskId);
  return events[events.length - 1]?.id ?? 0;
}

describe("a resume whose worktree was cleaned", () => {
  it("rebuilds it at the same path on the same branch and starts the agent there", async () => {
    const target = await repo();
    const task = await cleanedTask(target);
    const afterClean = lastEventId(task.id);

    const resumed = await resume(task);

    expect(resumed.recreatedFrom).toBe(task.branch);
    expect(resumed.via).toBe("fresh");
    expect(resumed.task.worktreePath).toBe(task.worktreePath);
    expect(resumed.task.branch).toBe(task.branch);
    expect(resumed.task.status).toBe("running");
    await expect(stat(task.worktreePath ?? "")).resolves.toBeTruthy();
    const listed = await gitIn(target.path, ["worktree", "list", "--porcelain"]);
    expect(listed.stdout).toContain(task.worktreePath ?? "");
    expect(listed.stdout).toContain(`branch refs/heads/${task.branch}`);
    await waitFor("the fake agent to log the composed prompt", async () =>
      ((await daemon.launch?.readLog()) ?? "").includes(`# Task ${task.id}`),
    );
    // The row never lost its path or its branch, so a recreate is not news of its own (ADR 031).
    const since = eventsSince(task.id, afterClean);
    expect(new Set(since.map((event) => event.kind))).toEqual(
      new Set(["task.status", "session.captured"]),
    );
    expect(since.find((event) => event.kind === "task.status")?.payload).toEqual({
      from: "stopped",
      to: "running",
    });
  });

  it("hands the recorded session id back, in the worktree it just rebuilt", async () => {
    const target = await repo();
    const task = await startTask(daemon, target);
    const session = task.session;
    if (session === undefined) {
      throw new Error("the launched task has no session");
    }
    daemon.ledger.tasks.setSession(task.id, { ...session, sessionId: "sess-42" });
    // The transcript the daemon checks for before it hands that id back; a clean leaves it alone.
    await seedTranscript(daemon, "sess-42");
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    await waitFor(
      "the stopped task to have no live session",
      () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
    );
    expect((await post(`/tasks/${task.id}/clean`, {})).status).toBe(200);

    const resumed = await resume(task);

    expect(resumed.via).toBe("native");
    expect(resumed.recreatedFrom).toBe(task.branch);
    expect(resumed.task.session?.sessionId).toBe("sess-42");
    await waitFor("the fake agent to be resumed by id", async () =>
      ((await daemon.launch?.readLog()) ?? "").includes("--resume sess-42"),
    );
  });

  it("says nothing about a recreate when the worktree was still there", async () => {
    const target = await repo();
    const task = await startTask(daemon, target);
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    await waitFor(
      "the stopped task to have no live session",
      () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
    );

    expect((await resume(task)).recreatedFrom).toBeNull();
  });

  it("does not bring back work that was never committed before the clean", async () => {
    // A recreate rebuilds from the branch's own commits; a clean forced over uncommitted work is
    // the fidelity limit ADR 031 names, not a bug in the recreate itself.
    const target = await repo();
    const task = await startTask(daemon, target);
    await writeFile(join(task.worktreePath ?? "", "uncommitted.txt"), "never committed\n");
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    await waitFor(
      "the stopped task to have no live session",
      () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
    );
    const cleaned = await post(`/tasks/${task.id}/clean`, { force: true });
    expect(cleaned.status).toBe(200);
    expect(((await cleaned.json()) as { removed: boolean }).removed).toBe(true);

    const resumed = await resume(task);

    expect(resumed.recreatedFrom).toBe(task.branch);
    await expect(stat(join(task.worktreePath ?? "", "uncommitted.txt"))).rejects.toThrowError();
  });

  it("refuses when the branch is gone too, and names it", async () => {
    const target = await repo();
    const task = await cleanedTask(target);
    await gitIn(target.path, ["branch", "-D", task.branch ?? ""]);

    const error = await refusal(task);

    expect(error.code).toBe("worktree-cleaned");
    expect(error.message).toContain(`its branch ${task.branch} no longer exists`);
    expect(error.hint).toContain('agn run "<prompt>"');
    expect(error.hint).not.toContain("--base");
    await expect(stat(task.worktreePath ?? "")).rejects.toThrowError();
    expect(daemon.ledger.tasks.get(task.id)?.status).toBe("stopped");
  });

  it("says git could not be asked rather than claiming the branch is gone", async () => {
    const target = await repo();
    const task = await cleanedTask(target);
    const restore = await shimGit("fatal: Unable to create '.git/index.lock': File exists.");

    try {
      const response = await post(`/tasks/${task.id}/resume`);
      expect(response.status).toBe(503);
      const { error } = (await response.json()) as {
        error: { code: string; message: string; hint: string };
      };
      expect(error.code).toBe("git-unavailable");
      expect(error.message).toContain("could not be checked");
      expect(error.hint).toContain("Try again");
    } finally {
      restore();
    }
    // The branch is still there, and a resume once git answers again rebuilds from it.
    expect((await resume(task)).recreatedFrom).toBe(task.branch);
  });

  it("refuses the same way when the clean deleted the branch itself", async () => {
    const task = await cleanedTask(await repo(), { deleteBranch: true });

    expect((await refusal(task)).message).toContain("no longer exists");
    expect(daemon.ledger.tasks.get(task.id)?.status).toBe("stopped");
  });

  it("refuses to rebuild over something else at the path", async () => {
    const target = await repo();
    const task = await cleanedTask(target);
    await mkdir(dirname(task.worktreePath ?? ""), { recursive: true });
    await writeFile(task.worktreePath ?? "", "not a worktree\n");

    const response = await post(`/tasks/${task.id}/resume`);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("worktree-occupied");
  });

  it("says the repo folder is gone for a folder task, which has no worktree to rebuild", async () => {
    const folder = await daemon.addRepo({
      git: false,
      defaultProfile: "claude-code:default:native",
    });
    const task = await startTask(daemon, folder);
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    await waitFor(
      "the stopped task to have no live session",
      () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
    );
    await rm(folder.path, { recursive: true, force: true });

    const response = await post(`/tasks/${task.id}/resume`);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "repo-missing",
    );
  });
});
