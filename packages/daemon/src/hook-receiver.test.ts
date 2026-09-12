import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type HarnessId,
  type HookResponse,
  newId,
  type Repo,
  type Task,
  type TaskStatus,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, TEST_TOKEN, type TestDaemon } from "./test-daemon.js";

let daemon: TestDaemon;
let repo: Repo;
let cwd = "";

beforeEach(async () => {
  daemon = await createTestDaemon();
  repo = await daemon.addRepo();
  cwd = await mkdtemp(join(tmpdir(), "agn-session-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
  await daemon.close();
});

type SeedOptions = {
  status?: TaskStatus;
  harness?: HarnessId;
  sessionId?: string | null;
  cwd?: string;
};

function seed(opts: SeedOptions = {}): Task {
  const now = new Date().toISOString();
  const id = newId();
  daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "a task",
    prompt: "do the thing",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    createdAt: now,
    updatedAt: now,
  });
  const started = daemon.ledger.tasks.start(id, {
    branch: null,
    session: {
      harness: opts.harness ?? "claude-code",
      sessionId: opts.sessionId ?? null,
      tmuxSession: `agn-${id}`,
      tmuxSocket: "agn-test",
      launchId: newId(),
      pid: null,
      cwd: opts.cwd ?? cwd,
      lastSeenAt: now,
    },
  });
  return opts.status === undefined || opts.status === "running"
    ? started
    : daemon.ledger.tasks.setStatus(id, opts.status);
}

function post(
  payload: unknown,
  init: { harness?: string; taskId?: string; token?: string } = {},
): Promise<Response> {
  return daemon.request(`/hooks/${init.harness ?? "claude-code"}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init.taskId === undefined ? {} : { "x-agn-task-id": init.taskId }),
      ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

async function body(response: Response): Promise<HookResponse> {
  expect(response.status).toBe(200);
  return (await response.json()) as HookResponse;
}

describe("POST /hooks/:harness", () => {
  it("moves the task the header names to waiting, and back to running", async () => {
    const task = seed();
    const stopped = await body(await post({ hook_event_name: "Stop" }, { taskId: task.id }));
    expect(stopped.applied).toBe("waiting");
    expect(stopped.task.status).toBe("waiting");

    const working = await body(
      await post({ hook_event_name: "UserPromptSubmit" }, { taskId: task.id }),
    );
    expect(working.applied).toBe("running");
    expect(
      daemon.ledger.events.forTask(task.id).filter((e) => e.kind === "task.status"),
    ).toHaveLength(3);
  });

  it("writes one event for a status the task already has", async () => {
    const task = seed();
    await post({ hook_event_name: "Stop" }, { taskId: task.id });
    const second = await body(await post({ hook_event_name: "Stop" }, { taskId: task.id }));
    expect(second.applied).toBeNull();
    expect(
      daemon.ledger.events.forTask(task.id).filter((event) => event.kind === "task.status"),
    ).toHaveLength(2);
  });

  it("captures the harness's own session id", async () => {
    const task = seed();
    const answer = await body(
      await post(
        { hook_event_name: "SessionStart", source: "startup", session_id: "fake-42" },
        { taskId: task.id },
      ),
    );
    expect(answer.applied).toBeNull();
    expect(answer.task.session?.sessionId).toBe("fake-42");
    expect(daemon.ledger.tasks.get(task.id)?.session?.sessionId).toBe("fake-42");
  });

  it("finds an adopted session by its session id, then by its directory", async () => {
    const bySession = seed({ sessionId: "codex-1", harness: "codex" });
    const byCwd = seed({ harness: "codex", cwd: `${cwd}-other` });
    const found = await body(
      await post({ hook_event_name: "Stop", session_id: "codex-1" }, { harness: "codex" }),
    );
    expect(found.task.id).toBe(bySession.id);
    const located = await body(
      await post({ hook_event_name: "Stop", cwd: `${cwd}-other` }, { harness: "codex" }),
    );
    expect(located.task.id).toBe(byCwd.id);
  });

  it("never moves a task that has already finished", async () => {
    const task = seed({ status: "stopped" });
    const answer = await body(await post({ hook_event_name: "Stop" }, { taskId: task.id }));
    expect(answer.applied).toBeNull();
    expect(answer.task.status).toBe("stopped");
  });

  it("applies nothing to a queued task, even when the header names it directly", async () => {
    const task = seed({ status: "queued" });
    const answer = await body(
      await post({ hook_event_name: "UserPromptSubmit" }, { taskId: task.id }),
    );
    expect(answer.applied).toBeNull();
    expect(answer.task.status).toBe("queued");
  });

  it("refuses a header that names a task of another harness", async () => {
    const task = seed({ harness: "claude-code" });
    const response = await post({ hook_event_name: "Stop" }, { harness: "codex", taskId: task.id });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "hook-task-unknown" } });
    expect(daemon.ledger.tasks.get(task.id)?.status).toBe("running");
  });

  it("answers 200 and applies nothing to an event it does not map", async () => {
    const task = seed();
    const answer = await body(await post({ hook_event_name: "PreCompact" }, { taskId: task.id }));
    expect(answer.applied).toBeNull();
    expect(await daemon.readLog()).toContain("hook ignored harness=claude-code event=PreCompact");
  });

  it("logs nothing for an event it understood but had no transition to make", async () => {
    const task = seed({ status: "waiting" });
    const answer = await body(await post({ hook_event_name: "Stop" }, { taskId: task.id }));
    expect(answer.applied).toBeNull();
    expect(await daemon.readLog()).not.toContain("hook ignored");
  });

  it("refuses a hook that matches no task", async () => {
    const response = await post({ hook_event_name: "Stop", cwd: "/nowhere/at/all" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "hook-task-unknown" } });
  });

  it("refuses a harness with no parser, a payload that is not JSON, and a payload too large", async () => {
    seed();
    expect((await post({ hook_event_name: "Stop" }, { harness: "other:aider" })).status).toBe(404);
    expect((await post("not json", { taskId: "x" })).status).toBe(400);
    const large = await post(`{"hook_event_name":"Stop","pad":"${"x".repeat(1024 * 1024)}"}`);
    expect(large.status).toBe(413);
  });

  it("needs the daemon's token like every other route", async () => {
    const response = await post({ hook_event_name: "Stop" }, { token: `${TEST_TOKEN}-wrong` });
    expect(response.status).toBe(401);
  });
});
