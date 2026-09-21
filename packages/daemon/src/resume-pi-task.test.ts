import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Repo, ResumeTaskResponse, Task, TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

/**
 * Pi's session id is the transcript file its extension reports, so `agn resume` hands the path
 * back with `--session` - but only while the file is still under Pi's own sessions directory
 * (lr01's `transcript-path` evidence). A path that is gone starts fresh instead.
 */

const PROFILE = "pi:default:native";

let daemon: TestDaemon;
let temp = "";
let argvLog = "";

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  temp = await mkdtemp(join(tmpdir(), "agn-pi-resume-"));
  argvLog = join(temp, "pi-argv.log");
  await installFakePi();
  // The per-user installer says out loud where it wrote; the test reads that, it does not print it.
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await daemon.close();
  await rm(temp, { recursive: true, force: true });
});

/**
 * Pi is not one of the harnesses on the launch PATH, so this test puts it there: a script that
 * writes down the arguments it was launched with and then stays up like a session would.
 */
async function installFakePi(): Promise<void> {
  const binDir = daemon.launch?.binDir;
  if (binDir === undefined) {
    throw new Error("this test needs a daemon built with `tmux: true`");
  }
  const file = join(binDir, "pi");
  await writeFile(file, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${argvLog}'\nsleep 30\n`, "utf8");
  await chmod(file, 0o755);
}

async function runTask(repo: Repo): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "add a --verbose flag" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

/** The transcript path Pi's extension reports, put on the row the way the receiver puts it there. */
function recordSession(task: Task, sessionId: string): void {
  const session = task.session;
  if (session === undefined) {
    throw new Error("the launched task has no session");
  }
  daemon.ledger.tasks.setSession(task.id, { ...session, sessionId });
}

async function transcript(name: string): Promise<string> {
  const sessions = join(daemon.home, ".pi", "agent", "sessions");
  await mkdir(sessions, { recursive: true });
  const file = join(sessions, name);
  await writeFile(file, '{"type":"session","id":"pi-abc"}\n', "utf8");
  return file;
}

async function stop(task: Task): Promise<void> {
  expect((await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" })).status).toBe(200);
  await waitFor("the stopped task to have no live session", async () => {
    const response = await daemon.request(`/tasks/${task.id}`);
    return ((await response.json()) as TaskResponse).task.status === "stopped";
  });
}

async function resume(task: Task): Promise<ResumeTaskResponse> {
  const response = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
  expect(response.status).toBe(200);
  return (await response.json()) as ResumeTaskResponse;
}

async function launchArgs(contains: string): Promise<string> {
  await waitFor(`pi to be launched with ${contains}`, async () =>
    (await readFile(argvLog, "utf8").catch(() => "")).includes(contains),
  );
  return await readFile(argvLog, "utf8");
}

/** The log grows by one launch each time pi starts, so a launch has landed once it is longer. */
async function launchAfter(previous: string): Promise<string> {
  await waitFor(
    "pi to be launched again",
    async () => (await readFile(argvLog, "utf8").catch(() => "")).length > previous.length,
  );
  return await readFile(argvLog, "utf8");
}

describe("POST /tasks/:id/resume for a pi task", () => {
  it("hands the transcript back with --session while pi still holds the file", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    const file = await transcript("2026-09-01T10-00-00_abc.jsonl");
    recordSession(task, file);
    await stop(task);

    const resumed = await resume(task);

    expect(resumed.via).toBe("native");
    expect(resumed.task.session?.sessionId).toBe(file);
    // Native resume carries no prompt: pi reopens the conversation the file holds.
    expect(await launchArgs(`--session ${file}`)).toContain(`--session ${file}`);
  });

  it("starts fresh when the transcript the row names is gone", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await runTask(repo);
    const file = await transcript("2026-09-01T11-00-00_def.jsonl");
    recordSession(task, file);
    const firstLaunch = await launchAfter("");
    await stop(task);
    await rm(file);

    const resumed = await resume(task);

    expect(resumed.via).toBe("fresh");
    expect(resumed.task.session?.sessionId).toBeNull();
    // The second launch has to land before the log can say pi was started without the file.
    expect(await launchAfter(firstLaunch)).not.toContain("--session");
  });
});
