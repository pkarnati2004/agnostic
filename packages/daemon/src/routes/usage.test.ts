import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type Task, type TaskUsageResponse, type UsageResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { writeClaudeTranscript, writeCodexRollout } from "../test-transcripts.js";

let daemon: TestDaemon;
let home = "";
let repoId = "";

const WORKTREE = "/tmp/agn-usage-route";

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "agn-usage-home-"));
  daemon = await createTestDaemon({ userHome: home });
  repoId = newId();
  daemon.ledger.repos.insert({
    id: repoId,
    path: "/tmp/alpha",
    kind: "git",
    name: "alpha",
    addedAt: new Date().toISOString(),
  });
});

afterEach(async () => {
  await daemon.close();
  await rm(home, { recursive: true, force: true });
});

function seedTask(profileId = "claude-code:default:native", sessionId = "s-aaaa"): Task {
  const now = new Date().toISOString();
  return daemon.ledger.tasks.insert({
    id: newId(),
    repoId,
    title: "ship the thing",
    prompt: "a prompt that must never reach the log",
    profileId,
    worktreePath: WORKTREE,
    branch: null,
    status: "running",
    origin: "agn",
    baseCommit: null,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: now,
    session: {
      harness: "claude-code",
      sessionId,
      tmuxSession: "agn-x",
      tmuxSocket: null,
      launchId: null,
      pid: null,
      cwd: WORKTREE,
      lastSeenAt: now,
    },
  });
}

async function usage(path = "/usage"): Promise<UsageResponse> {
  const response = await daemon.request(path);
  expect(response.status).toBe(200);
  return (await response.json()) as UsageResponse;
}

describe("GET /usage", () => {
  it("answers with both windows and one row per harness", async () => {
    seedTask();
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE }]);
    await writeCodexRollout(home, [{ session: "t-1111", cwd: "/Users/me/other" }]);

    const body = await usage();

    expect(body.day.window.kind).toBe("day");
    expect(body.week.window.kind).toBe("week");
    expect(body.day.window.since >= body.week.window.since).toBe(true);
    expect(body.day.plans).toEqual([
      expect.objectContaining({
        harness: "claude-code",
        vendor: "claude",
        // The fixture detection reads max20 off the harness, so no config entry is needed.
        plan: "max20",
        unattributedTokens: 0,
        fableShare: 1,
      }),
      expect.objectContaining({
        harness: "codex",
        vendor: "chatgpt",
        plan: null,
        unattributedTokens: 1_500,
        fableShare: null,
      }),
    ]);
  });

  it("records each turn once, however often it is asked", async () => {
    seedTask();
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE }]);

    const first = await usage();
    const second = await usage();

    expect(second.day.plans[0]?.usage).toEqual(first.day.plans[0]?.usage);
    const recorded = daemon.ledger.events
      .after(0, 1_000)
      .filter((event) => event.kind === "usage.recorded");
    expect(recorded).toHaveLength(1);
  });

  it("answers with no rows when nothing has been spent", async () => {
    const body = await usage();

    expect(body).toMatchObject({ day: { plans: [] }, week: { plans: [] } });
  });

  it("ignores a query string it does not know", async () => {
    await expect(usage("/usage?window=day")).resolves.toMatchObject({ day: { plans: [] } });
  });
});

describe("GET /tasks/:id/usage", () => {
  it("answers with the task, its tokens and how they are billed", async () => {
    const task = seedTask();
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, message: "a" },
      { session: "s-other", cwd: "/Users/me/elsewhere", message: "b" },
    ]);

    const response = await daemon.request(`/tasks/${task.id}/usage`);
    const body = (await response.json()) as TaskUsageResponse;

    expect(response.status).toBe(200);
    expect(body.task.id).toBe(task.id);
    expect(body.billing).toBe("subscription");
    expect(body.usage).toMatchObject({
      tokens: 1_500,
      tokensInput: 1_000,
      tokensOutput: 500,
      costUsd: null,
    });
  });

  it("prices a task that runs on a key", async () => {
    const task = seedTask("claude-code:claude-fable-5-1:openrouter");
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, input: 1_000_000, output: 0 },
    ]);

    const response = await daemon.request(`/tasks/${task.id}/usage`);
    const body = (await response.json()) as TaskUsageResponse;

    expect(body).toMatchObject({ billing: "api-key", usage: { costUsd: 10 } });
  });

  it("answers with zero tokens for a task that has spent nothing", async () => {
    const task = seedTask();

    const response = await daemon.request(`/tasks/${task.id}/usage`);

    expect(((await response.json()) as TaskUsageResponse).usage.tokens).toBe(0);
  });

  it("says which task it could not find", async () => {
    const response = await daemon.request("/tasks/nosuchtask/usage");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "task-not-found" } });
  });
});
