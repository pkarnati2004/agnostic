import type { Outcome, Repo, Task } from "@agnostic/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "./ledger.js";

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
  status: "done",
  origin: "agn",
  baseCommit: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
};

const outcome: Outcome = {
  taskId: task.id,
  testsBefore: false,
  testsAfter: true,
  accepted: true,
  reverted: false,
  agentLines: 210,
  humanChangedLines: null,
  humanEditRatio: null,
  durationSec: 912.5,
  costUsd: null,
  tokens: 143_000,
  resolvedModel: "claude-sonnet-4-5-20250929",
};

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
  ledger.repos.insert(repo);
  ledger.tasks.insert(task);
});

afterEach(() => {
  ledger.close();
});

describe("outcomes.record", () => {
  it("round-trips booleans and the fields the diff has not filled in", () => {
    expect(ledger.outcomes.record(outcome)).toEqual(outcome);
    expect(ledger.outcomes.get(task.id)).toEqual(outcome);
    expect(ledger.outcomes.get("z9z9z9z9z9")).toBeNull();
  });

  it("writes outcome.recorded carrying the outcome", () => {
    ledger.outcomes.record(outcome);
    const [event] = ledger.events.forTask(task.id).slice(-1);
    expect(event).toMatchObject({ kind: "outcome.recorded", payload: { outcome } });
  });

  it("replaces the row when the edit ratio arrives later and records that too", () => {
    ledger.outcomes.record(outcome);
    const reviewed: Outcome = { ...outcome, humanChangedLines: 42, humanEditRatio: 0.2 };
    expect(ledger.outcomes.record(reviewed)).toEqual(reviewed);
    expect(ledger.outcomes.get(task.id)).toEqual(reviewed);
    expect(
      ledger.events.forTask(task.id).filter((event) => event.kind === "outcome.recorded"),
    ).toHaveLength(2);
  });

  it("refuses an outcome for a task that does not exist and leaves no event behind", () => {
    const latest = ledger.events.latestId();
    expect(() => ledger.outcomes.record({ ...outcome, taskId: "z9z9z9z9z9" })).toThrowError(
      expect.objectContaining({ code: "task-not-found" }),
    );
    expect(ledger.events.latestId()).toBe(latest);
    expect(ledger.outcomes.get("z9z9z9z9z9")).toBeNull();
  });

  it("round-trips a null resolvedModel for a task the daemon could not identify", () => {
    const unresolved: Outcome = { ...outcome, resolvedModel: null };
    expect(ledger.outcomes.record(unresolved)).toEqual(unresolved);
    expect(ledger.outcomes.get(task.id)).toEqual(unresolved);
  });
});

describe("outcomes.testedAtCommit", () => {
  const tested: Task = { ...task, id: "t9v2wxyzab", baseCommit: "9f1c0de" };

  it("reuses what another task off the same commit already measured", () => {
    ledger.tasks.insert(tested);
    ledger.outcomes.record({ ...outcome, taskId: tested.id, testsBefore: true });
    expect(ledger.outcomes.testedAtCommit(repo.id, "9f1c0de")).toBe(true);
  });

  it("is null for a commit nobody tested, another repo, and a row with no result", () => {
    ledger.tasks.insert(tested);
    ledger.outcomes.record({ ...outcome, taskId: tested.id, testsBefore: null });
    expect(ledger.outcomes.testedAtCommit(repo.id, "9f1c0de")).toBeNull();
    expect(ledger.outcomes.testedAtCommit(repo.id, "0000000")).toBeNull();
    expect(ledger.outcomes.testedAtCommit("r0000000zz", "9f1c0de")).toBeNull();
  });

  it("remembers a failure as a failure, not as nothing", () => {
    ledger.tasks.insert(tested);
    ledger.outcomes.record({ ...outcome, taskId: tested.id, testsBefore: false });
    expect(ledger.outcomes.testedAtCommit(repo.id, "9f1c0de")).toBe(false);
  });
});
