import type { Outcome, Repo, Task } from "@agnostic/core";
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
  worktreePath: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
  branch: "agn/split-the-recommender-t3n9v2wxyz",
  status: "done",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
};

const child: Task = { ...task, id: "q4m8n2vwxy", parentTaskId: task.id, status: "running" };

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
  tokens: 3000,
  resolvedModel: "claude-sonnet-4-5-20250929",
};

const WINDOW = { since: "2026-09-10T00:00:00.000Z", until: "2026-09-11T00:00:00.000Z" };

function usageRow(ref: string): UsageInput {
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
    ref,
  };
}

function tokens(ledger: Ledger): number {
  return ledger.usage.summarize(WINDOW).reduce((total, breakdown) => total + breakdown.tokens, 0);
}

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
  ledger.repos.insert(repo);
  ledger.tasks.insert(task);
  ledger.tasks.setStatus(task.id, "running");
  ledger.tasks.insert(child);
  ledger.outcomes.record(outcome);
  ledger.usage.record(task.id, ["a", "b", "c"].map(usageRow));
});

afterEach(() => {
  ledger.close();
});

describe("tasks.delete", () => {
  it("takes the row, its events and its outcome, and keeps the usage unattributed", () => {
    const before = tokens(ledger);
    ledger.tasks.delete(task.id, { removedWorktree: true });

    expect(ledger.tasks.get(task.id)).toBeNull();
    expect(ledger.outcomes.get(task.id)).toBeNull();
    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual(["task.deleted"]);
    const breakdowns = ledger.usage.summarize(WINDOW);
    expect(breakdowns).toHaveLength(1);
    expect(breakdowns[0]?.attributed).toBe(false);
    expect(tokens(ledger)).toBe(before);
    expect(ledger.usage.sumForTask(task.id).tokens).toBe(0);
  });

  it("leaves a handoff child as a root", () => {
    ledger.tasks.delete(task.id, { removedWorktree: true });
    expect(ledger.tasks.get(child.id)?.parentTaskId).toBeUndefined();
  });

  it("records one task.deleted after the task's own events are gone", () => {
    const cursor = ledger.events.latestId();
    ledger.tasks.delete(task.id, { removedWorktree: false });
    const events = ledger.events.after(cursor);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      taskId: task.id,
      repoId: repo.id,
      kind: "task.deleted",
      payload: { removedWorktree: false },
    });
  });

  it("refuses an id no task has", () => {
    expect(() => ledger.tasks.delete("zzzzzzzzzz", { removedWorktree: false })).toThrow(
      /no task with id/,
    );
  });

  it("keeps every row when the write inside the transaction fails", () => {
    const before = tokens(ledger);
    // The event is appended last and validated against its own payload shape, so a payload the
    // schema refuses is a throw after every delete in the transaction has run.
    const bad = { removedWorktree: "yes" } as unknown as { removedWorktree: boolean };
    expect(() => ledger.tasks.delete(task.id, bad)).toThrow(/does not carry that kind's payload/);

    expect(ledger.tasks.get(task.id)).not.toBeNull();
    expect(ledger.outcomes.get(task.id)).toEqual(outcome);
    // task.created, task.status, outcome.recorded and usage.recorded, all still the task's.
    expect(ledger.events.forTask(task.id)).toHaveLength(4);
    expect(ledger.usage.sumForTask(task.id).tokens).toBe(before);
    expect(ledger.tasks.get(child.id)?.parentTaskId).toBe(task.id);
  });
});
