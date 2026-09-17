import type { Repo, Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "./ledger.js";
import type { UsageInput } from "./usage-queries.js";

const repo: Repo = {
  id: "r7k2m4pqrs",
  path: "/Users/dev/code/agnostic",
  kind: "git",
  name: "agnostic",
  addedAt: "2026-09-10T11:00:00.000Z",
  status: "active",
};

const task: Task = {
  id: "t3n9v2wxyz",
  repoId: repo.id,
  title: "Split the recommender scoring out of the daemon",
  prompt: "Move scoring into packages/recommender.",
  profileId: "claude-code:sonnet-4.5:native",
  worktreePath: null,
  branch: null,
  status: "running",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
};

function row(overrides: Partial<UsageInput> = {}): UsageInput {
  return {
    ts: "2026-09-10T12:10:00.000Z",
    harness: "claude-code",
    model: "sonnet-4.5",
    tokensInput: 900,
    tokensOutput: 100,
    tokensCacheRead: null,
    tokensCacheWrite: null,
    tokens: 1000,
    costUsd: 0.5,
    source: "transcript",
    ref: null,
    ...overrides,
  };
}

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
  ledger.repos.insert(repo);
  ledger.tasks.insert(task);
});

afterEach(() => {
  ledger.close();
});

describe("usage.record", () => {
  it("inserts every row and writes one usage.recorded summing them", () => {
    const result = ledger.usage.record(task.id, [
      row({ ref: "transcript-1" }),
      row({ ref: "transcript-2", tokens: 500, costUsd: null }),
      row({ tokens: 250, costUsd: 0.25 }),
    ]);
    expect(result.inserted).toBe(3);
    expect(result.event).toMatchObject({
      kind: "usage.recorded",
      taskId: task.id,
      payload: { tokens: 1750, costUsd: 0.75, source: "transcript" },
    });
    expect(ledger.usage.sumForTask(task.id).tokens).toBe(1750);
  });

  it("ignores a rescan of the same refs and writes no event", () => {
    ledger.usage.record(task.id, [row({ ref: "transcript-1" }), row({ ref: "transcript-2" })]);
    const latest = ledger.events.latestId();
    const again = ledger.usage.record(task.id, [
      row({ ref: "transcript-1" }),
      row({ ref: "transcript-2" }),
    ]);
    expect(again).toEqual({ inserted: 0, event: null });
    expect(ledger.events.latestId()).toBe(latest);
  });

  it("always inserts rows without a ref", () => {
    ledger.usage.record(task.id, [row()]);
    expect(ledger.usage.record(task.id, [row()]).inserted).toBe(1);
    expect(ledger.usage.sumForTask(task.id).tokens).toBe(2000);
  });

  it("accepts usage from a session agn did not start", () => {
    const result = ledger.usage.record(null, [row({ source: "hook" })]);
    expect(result.inserted).toBe(1);
    expect(result.event?.taskId).toBeUndefined();
  });
});

describe("usage.sumForTask", () => {
  it("sums tokens, the per-bucket counts and cost", () => {
    ledger.usage.record(task.id, [
      row({ tokensCacheRead: 10, tokensCacheWrite: null }),
      row({ tokens: 500, tokensInput: 400, tokensOutput: 100, tokensCacheRead: 5, costUsd: null }),
    ]);
    expect(ledger.usage.sumForTask(task.id)).toEqual({
      tokens: 1500,
      tokensInput: 1300,
      tokensOutput: 200,
      tokensCacheRead: 15,
      tokensCacheWrite: null,
      costUsd: 0.5,
    });
  });

  it("returns zero tokens and no cost for a task with no usage", () => {
    expect(ledger.usage.sumForTask(task.id)).toEqual({
      tokens: 0,
      tokensInput: null,
      tokensOutput: null,
      tokensCacheRead: null,
      tokensCacheWrite: null,
      costUsd: null,
    });
  });
});

describe("usage.summarize", () => {
  beforeEach(() => {
    ledger.usage.record(task.id, [
      row({ ts: "2026-09-09T23:00:00.000Z", tokens: 7 }),
      row({ ts: "2026-09-10T01:00:00.000Z", tokens: 100 }),
      row({ ts: "2026-09-10T02:00:00.000Z", harness: "codex", tokens: 30, costUsd: null }),
      row({ ts: "2026-09-10T03:00:00.000Z", harness: "codex", tokens: 20, costUsd: null }),
      row({ ts: "2026-09-11T00:00:00.000Z", tokens: 9 }),
    ]);
  });

  const day = { since: "2026-09-10T00:00:00.000Z", until: "2026-09-11T00:00:00.000Z" };

  it("splits the window by harness, model and whether a task owns the row", () => {
    ledger.usage.record(null, [
      row({ ts: "2026-09-10T04:00:00.000Z", tokens: 40, costUsd: null }),
      row({ ts: "2026-09-10T05:00:00.000Z", model: "fable-5", tokens: 3, costUsd: null }),
    ]);
    expect(ledger.usage.summarize(day)).toEqual([
      expect.objectContaining({
        harness: "claude-code",
        model: "fable-5",
        attributed: false,
        tokens: 3,
      }),
      expect.objectContaining({
        harness: "claude-code",
        model: "sonnet-4.5",
        attributed: false,
        tokens: 40,
      }),
      expect.objectContaining({
        harness: "claude-code",
        model: "sonnet-4.5",
        attributed: true,
        tokens: 100,
        costUsd: 0.5,
      }),
      // Every codex row was on a subscription, so the window has no cost to report.
      expect.objectContaining({ harness: "codex", tokens: 50, costUsd: null, attributed: true }),
    ]);
  });

  it("includes a row exactly at since and excludes one exactly at until", () => {
    ledger.usage.record(task.id, [
      row({ ts: "2026-09-10T00:00:00.000Z", tokens: 1000 }),
      row({ ts: "2026-09-11T00:00:00.000Z", tokens: 2000 }),
    ]);
    const claudeCode = ledger.usage
      .summarize(day)
      .filter((line) => line.harness === "claude-code")
      .reduce((total, line) => total + line.tokens, 0);
    // 100 from the outer beforeEach plus the 1000 landing exactly on since; the 2000 at until is out.
    expect(claudeCode).toBe(1100);
  });

  it("reports no cost when nothing in the group was priced", () => {
    const codex = ledger.usage.summarize(day).find((line) => line.harness === "codex");
    expect(codex).toMatchObject({ costUsd: null, tokensInput: 1800, tokensCacheRead: null });
  });
});

describe("usage.latestModelForTask", () => {
  it("reports the model of the newest row that names one", () => {
    ledger.usage.record(task.id, [
      row({ ts: "2026-09-10T12:10:00.000Z", model: "sonnet-4.5", ref: "a" }),
      row({ ts: "2026-09-10T12:40:00.000Z", model: "opus-5", ref: "b" }),
      row({ ts: "2026-09-10T12:50:00.000Z", model: null, ref: "c" }),
    ]);
    expect(ledger.usage.latestModelForTask(task.id)).toBe("opus-5");
  });

  it("is null for a task with no rows, and for rows that name no model", () => {
    expect(ledger.usage.latestModelForTask(task.id)).toBeNull();
    ledger.usage.record(task.id, [row({ model: null, ref: "d" })]);
    expect(ledger.usage.latestModelForTask(task.id)).toBeNull();
  });
});
