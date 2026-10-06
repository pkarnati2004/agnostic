import { mkdir, writeFile } from "node:fs/promises";
import { agPaths, type Repo, type Task, type TaskResponse } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDaemon, type TestDaemon, waitFor } from "./test-daemon.js";

const PROFILE = "claude-code:default:native";

let daemon: TestDaemon;

beforeEach(async () => {
  daemon = await createTestDaemon({ tmux: true });
});

afterEach(() => daemon.close());

async function started(repo: Repo, body: Record<string, unknown>): Promise<Task> {
  const response = await daemon.request(`/repos/${repo.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as TaskResponse).task;
}

async function agentLog(contains: string): Promise<string> {
  await waitFor(
    `the fake agent to log ${contains}`,
    async () => (await daemon.launch?.readLog())?.includes(contains) === true,
  );
  return (await daemon.launch?.readLog()) ?? "";
}

/** The prompt of this task alone: every fake agent appends to one log, so the segments are split
 * on the line each launch writes its prompt under. */
async function segment(task: Task): Promise<string> {
  const log = await agentLog(`# Task ${task.id}`);
  return log.split("prompt:").find((part) => part.includes(`# Task ${task.id}`)) ?? "";
}

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
    compareId: null,
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

  it("ends with agn's own commit prompt when the repo has written none", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    const task = await started(repo, { prompt: "the new one" });
    expect(await segment(task)).toContain(`Commit your work on \`${task.branch}\``);
  });

  it("sends the repo's commit prompt instead, as written", async () => {
    const repo = await daemon.addRepo({ defaultProfile: PROFILE });
    await mkdir(agPaths(repo.path).promptsDir, { recursive: true });
    await writeFile(agPaths(repo.path).commitPromptMd, "Run `/land` and stop.\n", "utf8");

    const task = await started(repo, { prompt: "the new one" });

    const log = await segment(task);
    expect(log).toContain("Run `/land` and stop.");
    expect(log).not.toContain("Commit your work on");
  });

  it("leaves the section out for a folder repo, which has no branch of agn's own", async () => {
    const folder = await daemon.addRepo({ git: false, defaultProfile: PROFILE });
    const task = await started(folder, { prompt: "the new one" });
    expect(task.branch).toBeNull();
    const log = await segment(task);
    expect(log).not.toContain("Before you finish");
    expect(log).not.toContain("Commit your work on");
  });
});
