import { writeFile } from "node:fs/promises";
import type { HandoffTaskResponse, Repo, Task, TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Detection } from "./detection-cache.js";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";
import { fixtureProfile, launchDetection } from "./test-detection.js";

/** The fixture's api-key profile and its subscription one; both run the fake `claude` on PATH. */
const KEYED = "claude-code:default:native";
const INCLUDED = "claude-code:sonnet-4.5:native";
/** A profile whose billing agn could not enumerate; code fact 1: counted, but never refused. */
const UNKNOWN = "claude-code:gpt-5:native";

let daemon: TestDaemon;
let rows = 0;

/** The machine a budget test runs on: the launch fixtures, with one profile billed by the token. */
function detection(binDir: string): Detection {
  const base = launchDetection(binDir, []);
  return {
    ...base,
    profiles: [
      fixtureProfile(null, { billing: "api-key" }),
      fixtureProfile("sonnet-4.5"),
      fixtureProfile("gpt-5", { billing: "unknown" }),
    ],
  };
}

beforeEach(async () => {
  daemon = await createTestDaemon({
    tmux: true,
    detect: () => Promise.resolve(detection(daemon?.launch?.binDir ?? "")),
  });
});

afterEach(() => daemon.close());

function ceiling(yaml: string): Promise<void> {
  return writeFile(daemon.paths.config, yaml, "utf8");
}

/** Priced spend of an earlier run, recorded the way the scan records what it read. */
function spent(costUsd: number): void {
  rows += 1;
  daemon.ledger.usage.record(null, [
    {
      ts: new Date().toISOString(),
      harness: "claude-code",
      model: "claude-fable-5-1",
      tokens: 1_000,
      tokensInput: 1_000,
      tokensOutput: 0,
      tokensCacheRead: null,
      tokensCacheWrite: null,
      costUsd,
      source: "transcript",
      ref: `budget-test-${rows}`,
    },
  ]);
}

function post(path: string, body?: Record<string, unknown>): Promise<Response> {
  return daemon.request(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

function run(repo: Repo, body: Record<string, unknown>): Promise<Response> {
  return post(`/repos/${repo.id}/tasks`, { prompt: "add a --verbose flag", ...body });
}

async function started(repo: Repo, body: Record<string, unknown>): Promise<Task> {
  const response = await run(repo, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function failure(
  response: Response,
): Promise<{ error: { code: string; message: string; hint: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string; hint: string } }>;
}

describe("a run against a spent budget", () => {
  it("refuses a profile billed by the token, and records no task", async () => {
    const repo = await daemon.addRepo();
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(5.12);

    const response = await run(repo, { profile: KEYED });

    expect(response.status).toBe(409);
    const { error } = await failure(response);
    expect(error.code).toBe("budget-exceeded");
    expect(error.message).toBe("today's priced spend is $5.12, over the $5.00 daily budget");
    expect(error.hint).toContain("--ignore-budget");
    expect(error.hint).toContain("budget.daily_usd");
    expect(daemon.ledger.tasks.list()).toEqual([]);
  });

  it("starts it anyway when the caller passes ignoreBudget", async () => {
    const repo = await daemon.addRepo();
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(5.12);

    const task = await started(repo, { profile: KEYED, ignoreBudget: true });

    expect(task.status).toBe("running");
  });

  it("starts a run that is only near the ceiling", async () => {
    const repo = await daemon.addRepo();
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(3.95);

    expect((await started(repo, { profile: KEYED })).status).toBe("running");
  });

  it("never counts a subscription profile", async () => {
    const repo = await daemon.addRepo();
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(6);

    expect((await started(repo, { profile: INCLUDED })).status).toBe("running");
  });

  it("names the weekly ceiling when the day is still within its own", async () => {
    const repo = await daemon.addRepo();
    await ceiling("budget:\n  daily_usd: 100\n  weekly_usd: 20\n");
    spent(21);

    const response = await run(repo, { profile: KEYED });

    expect(response.status).toBe(409);
    const { error } = await failure(response);
    expect(error.message).toBe("this week's priced spend is $21.00, over the $20.00 weekly budget");
    expect(error.hint).toContain("budget.weekly_usd");
  });

  it("asks nothing of the transcripts when no ceiling is set", async () => {
    const repo = await daemon.addRepo();
    spent(50);

    expect((await started(repo, { profile: KEYED })).status).toBe("running");
  });

  it("never refuses a profile whose billing agn could not determine", async () => {
    const repo = await daemon.addRepo();
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(50);

    expect((await started(repo, { profile: UNKNOWN })).status).toBe("running");
  });
});

describe("a handoff against a spent budget", () => {
  it("refuses it and leaves the parent running", async () => {
    const repo = await daemon.addRepo();
    const parent = await started(repo, { profile: INCLUDED });
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(5);

    const response = await post(`/tasks/${parent.id}/handoff`, { profile: KEYED });

    expect(response.status).toBe(409);
    expect((await failure(response)).error.code).toBe("budget-exceeded");
    expect(daemon.ledger.tasks.get(parent.id)?.status).toBe("running");
  });

  it("hands off anyway when the caller passes ignoreBudget", async () => {
    const repo = await daemon.addRepo();
    const parent = await started(repo, { profile: INCLUDED });
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(5);

    const response = await post(`/tasks/${parent.id}/handoff`, {
      profile: KEYED,
      ignoreBudget: true,
    });

    expect(response.status).toBe(201);
    expect(((await response.json()) as HandoffTaskResponse).task.profileId).toBe(KEYED);
  });
});

describe("a resume against a spent budget", () => {
  it("continues work that has already started", async () => {
    const repo = await daemon.addRepo();
    const task = await started(repo, { profile: KEYED });
    expect((await post(`/tasks/${task.id}/stop`)).status).toBe(200);
    await waitFor(
      "the task to be stopped",
      () => daemon.ledger.tasks.get(task.id)?.status === "stopped",
    );
    await ceiling("budget:\n  daily_usd: 5\n");
    spent(6);

    expect((await post(`/tasks/${task.id}/resume`)).status).toBe(200);
  });
});
