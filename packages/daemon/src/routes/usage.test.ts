import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId, type Task, type TaskUsageResponse, type UsageResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDaemon, type TestDaemon } from "../test-daemon.js";
import { fixtureDetection, fixtureProfile } from "../test-detection.js";
import { writeClaudeTranscript, writeCodexRollout } from "../test-transcripts.js";

let daemon: TestDaemon;
let home = "";
let repoId = "";

const WORKTREE = "/tmp/agn-usage-route";

/**
 * `GET /usage` bounds its windows at `[midnight, the instant the request arrived)`, so a turn
 * written in the same millisecond as the request would fall outside them.
 */
function aMomentAgo(): string {
  return new Date(Date.now() - 1_000).toISOString();
}

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
    status: "active",
  });
});

afterEach(async () => {
  vi.useRealTimers();
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
    compareId: null,
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
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE, ts: aMomentAgo() }]);
    await writeCodexRollout(home, [
      { session: "t-1111", cwd: "/Users/me/other", ts: aMomentAgo() },
    ]);

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
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE, ts: aMomentAgo() }]);

    const first = await usage();
    const second = await usage();

    expect(second.day.plans[0]?.usage).toEqual(first.day.plans[0]?.usage);
    const recorded = daemon.ledger.events
      .after(0, 1_000)
      .filter((event) => event.kind === "usage.recorded");
    expect(recorded).toHaveLength(1);
  });

  it("counts a turn stamped in the millisecond the request arrived", async () => {
    seedTask();
    vi.useFakeTimers({ toFake: ["Date"] });
    const arrived = Date.now();
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, ts: new Date(arrived).toISOString() },
    ]);
    // The clock moves on while the scan reads the transcripts, as it does on a real machine.
    const record = daemon.ledger.usage.record;
    daemon.ledger.usage.record = (taskId, rows) => {
      vi.setSystemTime(arrived + 1);
      return record(taskId, rows);
    };

    const body = await usage();

    expect(body.day.plans[0]?.usage).toMatchObject({ tokens: 1_500 });
  });

  it("answers with no rows when nothing has been spent", async () => {
    const body = await usage();

    expect(body).toMatchObject({ day: { plans: [] }, week: { plans: [] } });
  });

  it("ignores a query string it does not know", async () => {
    await expect(usage("/usage?window=day")).resolves.toMatchObject({ day: { plans: [] } });
  });

  it("still counts tokens from a task whose repo is closed", async () => {
    seedTask();
    daemon.ledger.repos.update(repoId, { status: "archived" });
    await writeClaudeTranscript(home, [{ session: "s-aaaa", cwd: WORKTREE, ts: aMomentAgo() }]);

    const body = await usage();

    expect(body.day.plans).toEqual([
      expect.objectContaining({
        harness: "claude-code",
        usage: expect.objectContaining({ tokens: 1_500 }),
      }),
    ]);
  });
});

describe("GET /usage and the budget", () => {
  /** A machine whose default profile runs on a key, so the scan prices every turn it attributes. */
  async function keyedDaemon(): Promise<void> {
    await daemon.close();
    daemon = await createTestDaemon({
      userHome: home,
      detect: () =>
        Promise.resolve({
          ...fixtureDetection(),
          profiles: [fixtureProfile(null, { billing: "api-key" }), fixtureProfile("sonnet-4.5")],
        }),
    });
    repoId = newId();
    daemon.ledger.repos.insert({
      id: repoId,
      path: "/tmp/alpha",
      kind: "git",
      name: "alpha",
      addedAt: new Date().toISOString(),
      status: "active",
    });
  }

  it("answers with no window when config.yaml sets no ceiling", async () => {
    expect((await usage()).budget).toEqual({ day: null, week: null });
  });

  it("counts what a run on a key cost today against the daily ceiling", async () => {
    await keyedDaemon();
    await writeFile(daemon.paths.config, "budget:\n  daily_usd: 5\n");
    seedTask();
    // 1M input tokens at the fixture catalog's $10 per million, then a tenth of that again.
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, ts: aMomentAgo(), input: 400_000, output: 0 },
      {
        session: "s-aaaa",
        cwd: WORKTREE,
        ts: aMomentAgo(),
        message: "b",
        input: 10_000,
        output: 0,
      },
    ]);

    const { budget } = await usage();

    expect(budget.week).toBeNull();
    expect(budget.day).toMatchObject({ limitUsd: 5, state: "warn" });
    expect(budget.day?.spentUsd).toBeCloseTo(4.1, 6);
  });

  it("counts nothing a subscription plan paid for", async () => {
    await keyedDaemon();
    await writeFile(daemon.paths.config, "budget:\n  weekly_usd: 20\n");
    seedTask("claude-code:sonnet-4.5:native", "s-bbbb");
    await writeClaudeTranscript(home, [
      { session: "s-bbbb", cwd: WORKTREE, ts: aMomentAgo(), input: 1_000_000, output: 0 },
    ]);

    const { budget } = await usage();

    expect(budget).toEqual({ day: null, week: { limitUsd: 20, spentUsd: 0, state: "ok" } });
  });

  it("leaves a turn from last week out of both windows", async () => {
    await keyedDaemon();
    await writeFile(daemon.paths.config, "budget:\n  daily_usd: 5\n  weekly_usd: 20\n");
    seedTask();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000).toISOString();
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, ts: eightDaysAgo, input: 1_000_000, output: 0 },
    ]);

    const { budget } = await usage();

    expect(budget.day?.spentUsd).toBe(0);
    expect(budget.week?.spentUsd).toBe(0);
  });
});

describe("GET /tasks/:id/usage", () => {
  it("answers with the task, its tokens and how they are billed", async () => {
    const task = seedTask();
    await writeClaudeTranscript(home, [
      { session: "s-aaaa", cwd: WORKTREE, message: "a", ts: aMomentAgo() },
      { session: "s-other", cwd: "/Users/me/elsewhere", message: "b", ts: aMomentAgo() },
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
      { session: "s-aaaa", cwd: WORKTREE, input: 1_000_000, output: 0, ts: aMomentAgo() },
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
