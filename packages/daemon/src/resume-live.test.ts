import type { Repo, ResumeTaskResponse, Task, TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { rejectingHarness } from "./test-launch-env.js";
import { seedTranscript } from "./test-transcript.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
  // The hook script finds the daemon the way any hook does: through daemon.json and the token file.
  await daemon.serve();
});

afterEach(() => daemon.close());

async function start(repo: Repo): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "do the thing", profile: PROFILE }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

/** The id the fake agent reported through its SessionStart hook, once the daemon has recorded it. */
async function capturedSession(task: Task, not: string | null = null): Promise<string> {
  let sessionId: string | null = null;
  await waitFor(
    "the fake agent to report its session id",
    () => {
      sessionId = daemon.ledger.tasks.get(task.id)?.session?.sessionId ?? null;
      return sessionId !== null && sessionId !== not && sessionId.startsWith("fake-");
    },
    15_000,
  );
  return sessionId ?? "";
}

async function stop(task: Task): Promise<void> {
  expect((await daemon.request(`/tasks/${task.id}/stop`, { method: "POST" })).status).toBe(200);
}

async function resume(task: Task): Promise<ResumeTaskResponse> {
  const response = await daemon.request(`/tasks/${task.id}/resume`, { method: "POST" });
  expect(response.status).toBe(200);
  return (await response.json()) as ResumeTaskResponse;
}

describe("resuming a session a real harness reported an id for", () => {
  it("starts fresh when nothing under the home carries that id, and records the new one", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    const dead = await capturedSession(task);
    await stop(task);

    const resumed = await resume(task);

    expect(resumed.via).toBe("fresh");
    expect(resumed.task.status).toBe("running");
    expect(resumed.task.session?.sessionId).toBeNull();
    // The session that came up reports its own id, and the next resume is native again.
    expect(await capturedSession(task, dead)).not.toBe(dead);
    expect(await daemon.launch?.readLog()).not.toContain(`--resume ${dead}`);
  });

  it("hands the id back when the transcript that carries it is there", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    const live = await capturedSession(task);
    await seedTranscript(daemon, live);
    await stop(task);

    const resumed = await resume(task);

    expect(resumed.via).toBe("native");
    expect(resumed.task.status).toBe("running");
    expect(resumed.task.session?.sessionId).toBe(live);
    await waitFor("the resumed harness to be launched with the id", async () =>
      ((await daemon.launch?.readLog()) ?? "").includes(`--resume ${live}`),
    );
  });

  it("clears the id when the harness it was handed to dies before its first hook", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await start(repo);
    const dead = await capturedSession(task);
    await seedTranscript(daemon, dead);
    await stop(task);
    // The transcript is there, so the resume is native; the harness rejects the id anyway, which
    // is the case the pre-flight check cannot see.
    await rejectingHarness(daemon.launch, "claude");

    expect((await resume(task)).via).toBe("native");

    await waitFor(
      "the rejected resume to fail",
      () => daemon.ledger.tasks.get(task.id)?.status === "failed",
      20_000,
    );
    // The close work behind the failure is where the belt runs, so the row is read after it.
    await waitFor(
      "the dead session id to be cleared at close",
      () => daemon.ledger.tasks.get(task.id)?.session?.sessionId === null,
    );
  });
});
