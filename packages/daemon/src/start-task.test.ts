import { mkdir, writeFile } from "node:fs/promises";
import {
  agPaths,
  type Repo,
  type Task,
  type TaskResponse,
  worktreePath,
  writeRepoConfig,
} from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function run(repo: Repo, body: Record<string, unknown>): Promise<Response> {
  return daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function started(repo: Repo, body: Record<string, unknown>): Promise<Task> {
  const response = await run(repo, body);
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

function failure(response: Response): Promise<{ error: { code: string; message: string } }> {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

describe("POST /repos/:id/tasks", () => {
  it("launches the repo's default profile in a worktree and records the session", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await started(repo, { prompt: "add a --verbose flag\nmore" });

    expect(task.title).toBe("add a --verbose flag");
    expect(task.status).toBe("running");
    expect(task.worktreePath).toBe(worktreePath(daemon.paths, repo.id, task.id));
    expect(task.branch).toBe(`agn/add-a-verbose-flag-${task.id}`);
    expect(task.session?.tmuxSession).toBe(`agn-${task.id}`);
    expect(task.session?.tmuxSocket).toBe(daemon.launch?.socketName);
    expect(task.session?.harness).toBe("claude-code");

    const log = await agentLog("prompt:");
    expect(log).toContain(`# Task ${task.id}`);
    expect(log).toContain("## Spec");
    expect(daemon.ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "recommendation.made",
      "session.captured",
      "task.status",
    ]);
  });

  it("takes a bare harness id as that harness on its defaults", async () => {
    const repo = await daemon.addRepo();
    const task = await started(repo, { prompt: "ship it", profile: "codex" });
    expect(task.profileId).toBe("codex:default:native");
    expect(await agentLog("ready cwd=")).toContain(task.worktreePath ?? "no worktree");
  });

  it("replaces the model segment with --model", async () => {
    const repo = await daemon.addRepo();
    const task = await started(repo, {
      prompt: "ship it",
      profile: "claude-code:opus:native",
      model: "haiku",
    });
    expect(task.profileId).toBe("claude-code:haiku:native");
    expect(await agentLog("prompt:")).toContain("--model haiku");
  });

  // ADR 019 replaced the old "refuses a run with no profile" test: resolution is --profile, then
  // default_profile, then the recommendation, so one logged-in agent is enough to run a task.
  it("starts on the recommended profile when nothing names one", async () => {
    const repo = await daemon.addRepo();
    const task = await started(repo, { prompt: "ship it" });
    expect(task.profileId).toBe(PROFILE);
    expect(task.recommendation?.recommended.profileId).toBe(PROFILE);
    const made = daemon.ledger.events
      .forTask(task.id)
      .find((event) => event.kind === "recommendation.made");
    expect(made?.payload).toMatchObject({ chosenProfileId: PROFILE });
  });

  it("records the recommendation beside the profile the user overrode it with", async () => {
    const repo = await daemon.addRepo();
    const task = await started(repo, { prompt: "ship it", profile: "codex" });
    expect(task.profileId).toBe("codex:default:native");
    expect(task.recommendation?.recommended.profileId).toBe(PROFILE);
    const made = daemon.ledger.events
      .forTask(task.id)
      .find((event) => event.kind === "recommendation.made");
    expect(made?.payload).toMatchObject({ chosenProfileId: "codex:default:native" });
  });

  it("records the intent the caller gave beside the one the rules found", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await started(repo, { prompt: "why is the login flow slow", intent: "debug" });
    expect(task.recommendation?.taskClass.intent).toBe("debug");
    expect(task.recommendation?.taskClass.automaticIntent).toBe("research");
  });

  it("refuses with the malformed-file error rather than defaulting over a bad preferences.yaml", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(
      agPaths(repo.path).preferencesYaml,
      "optimize: balanced\nrisk_rules:\n  - area: auth\n   keywords: [auth]\n",
      "utf8",
    );
    const response = await run(repo, { prompt: "ship it" });
    expect(response.status).toBe(400);
    expect((await failure(response)).error.code).toBe("ag-file-malformed");
    expect(daemon.ledger.tasks.list()).toHaveLength(0);
  });

  it("fails the task when the setup command fails, and launches nothing", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await writeRepoConfig(repo.path, {
      id: repo.id,
      testCommand: null,
      lintCommand: null,
      defaultProfileId: PROFILE,
      baseBranch: null,
      branchPrefix: null,
      setupCommand: "exit 3",
      cleanAfterMerge: false,
    });
    const response = await run(repo, { prompt: "ship it" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const task = daemon.ledger.tasks.list()[0];
    expect(task?.status).toBe("failed");
    expect(task?.session).toBeUndefined();
    expect(daemon.ledger.events.forTask(task?.id ?? "").map((event) => event.kind)).toEqual([
      "task.created",
      "recommendation.made",
      "task.status",
    ]);
  });
});

describe("the local route", () => {
  it("launches against the model server detection found", async () => {
    const server = {
      name: "lmstudio" as const,
      port: 1234,
      baseUrl: "http://127.0.0.1:1234",
      models: ["qwen3-coder"],
    };
    await daemon.close();
    daemon = await createTestDaemon({ tmux: true, servers: [server] });
    const repo = await daemon.addRepo();
    const task = await started(repo, { prompt: "ship it", profile: "codex:qwen3-coder:local" });
    expect(task.profileId).toBe("codex:qwen3-coder:local");
    const log = await agentLog("model_provider=agn-local");
    expect(log).toContain(`model_providers.agn-local.base_url=${server.baseUrl}/v1`);
  });
});

describe("the launch prompt", () => {
  it("carries the spec, the repo state and the last five decisions, and no instructions", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await mkdir(agPaths(repo.path).dir, { recursive: true });
    await writeFile(
      agPaths(repo.path).decisionsMd,
      ["one", "two", "three", "four", "five", "six", "seven"].join("\n"),
      "utf8",
    );
    await writeFile(agPaths(repo.path).instructionsMd, "never repeat the house style\n", "utf8");
    seedDoneTask(repo);
    const inFlight = await started(repo, { prompt: "the one already going" });

    const task = await started(repo, { prompt: "the new one" });
    // Both fake agents append to one log and neither waits for the other, so this picks the
    // segment that belongs to this task rather than the last one written.
    const log =
      (await agentLog(`# Task ${task.id}`))
        .split("prompt:")
        .find((part) => part.includes(`# Task ${task.id}`)) ?? "";
    expect(log).toContain("Done recently:");
    expect(log).toContain("accepted, tests pass, human edits 12%");
    expect(log).toContain(`In flight:`);
    expect(log).toContain(`${inFlight.title} (${inFlight.branch}, ${PROFILE})`);
    expect(log).toContain("Recent decisions:\n- three\n- four\n- five\n- six\n- seven");
    expect(log).not.toContain("- two");
    expect(log).not.toContain("house style");
  });
});

function seedDoneTask(repo: Repo): void {
  const now = new Date().toISOString();
  const id = "mnpqrstuvw";
  daemon.ledger.tasks.insert({
    id,
    repoId: repo.id,
    title: "the finished one",
    prompt: "p",
    profileId: PROFILE,
    worktreePath: null,
    branch: "agn/finished",
    status: "done",
    origin: "agn",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
  daemon.ledger.outcomes.record({
    taskId: id,
    testsBefore: null,
    testsAfter: true,
    accepted: true,
    reverted: null,
    agentLines: null,
    humanChangedLines: null,
    humanEditRatio: 0.12,
    durationSec: 10,
    costUsd: null,
    tokens: 100,
    resolvedModel: null,
  });
}

describe("profile validation", () => {
  it("refuses a profile string that is neither a profile id nor a harness id", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const response = await run(repo, { prompt: "ship it", profile: "not a profile" });
    expect(response.status).toBe(400);
    expect((await failure(response)).error.code).toBe("invalid-profile-id");
    expect(daemon.ledger.tasks.list()).toHaveLength(0);
  });
});

describe("task titles", () => {
  it("cuts a long first line at 80 characters", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const long = "x".repeat(90);
    const task = await started(repo, { prompt: `${long}\nmore detail below` });
    expect(task.title).toBe("x".repeat(80));
  });

  it("falls back to untitled task for a blank prompt line", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await started(repo, { prompt: "\nthe real instruction is on line two" });
    expect(task.title).toBe("untitled task");
  });
});
