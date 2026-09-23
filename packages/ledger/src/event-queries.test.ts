import type { EventInput, Outcome, Repo, Task } from "@agnostic/core";
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
  status: "queued",
  origin: "agn",
  baseCommit: null,
  compareId: null,
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
};

function adopted(taskId: string): EventInput<"task.adopted"> {
  return {
    ts: "2026-09-10T12:05:00.000Z",
    taskId,
    kind: "task.adopted",
    payload: { pid: 4211, cwd: "/Users/dev/code/agnostic" },
  };
}

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
});

afterEach(() => {
  ledger.close();
});

describe("events.append", () => {
  it("hands out ascending ids and returns the event it stored", () => {
    const first = ledger.events.append(adopted(task.id));
    expect(first).toEqual({ ...adopted(task.id), id: 1 });
    expect(ledger.events.append(adopted(task.id)).id).toBe(2);
    expect(ledger.events.append(adopted(task.id)).id).toBe(3);
    expect(ledger.events.latestId()).toBe(3);
  });

  it("refuses a payload that belongs to another kind", () => {
    const crossed = { ...adopted(task.id), payload: { from: "queued", to: "running" } };
    expect(() =>
      ledger.events.append(crossed as unknown as EventInput<"task.adopted">),
    ).toThrowError(expect.objectContaining({ code: "event-invalid" }));
    expect(ledger.events.latestId()).toBe(0);
  });

  it("keeps the kinds that have no row of their own", () => {
    const handoff: EventInput<"task.handoff"> = {
      ts: "2026-09-10T12:06:00.000Z",
      taskId: task.id,
      kind: "task.handoff",
      payload: {
        fromProfileId: "claude-code:sonnet-4.5:native",
        toProfileId: "codex:gpt-5:native",
        childTaskId: "p4k8m2qrst",
        note: null,
      },
    };
    ledger.events.append(handoff);
    expect(ledger.events.after(0)).toEqual([{ ...handoff, id: 1 }]);
  });
});

describe("events.after", () => {
  beforeEach(() => {
    ledger.events.append(adopted(task.id));
    ledger.events.append(adopted(task.id));
    ledger.events.append(adopted(task.id));
  });

  it("returns everything past the cursor, oldest first", () => {
    expect(ledger.events.after(0).map((event) => event.id)).toEqual([1, 2, 3]);
    expect(ledger.events.after(2).map((event) => event.id)).toEqual([3]);
    expect(ledger.events.after(3)).toEqual([]);
  });

  it("honors the limit", () => {
    expect(ledger.events.after(0, 2).map((event) => event.id)).toEqual([1, 2]);
  });
});

describe("events.forTask", () => {
  it("returns one task's events, oldest first", () => {
    ledger.repos.insert(repo);
    ledger.tasks.insert(task);
    ledger.tasks.insert({ ...task, id: "p4k8m2qrst" });
    ledger.tasks.setStatus(task.id, "running");

    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "task.status",
    ]);
    expect(ledger.events.forTask("p4k8m2qrst")).toHaveLength(1);
    expect(ledger.events.forTask("z9z9z9z9z9")).toEqual([]);
  });
});

describe("events.latest", () => {
  it("returns the newest event of one kind, and null when there is none", () => {
    ledger.repos.insert(repo);
    ledger.tasks.insert(task);
    expect(ledger.events.latest("task.adopted")).toBeNull();

    ledger.events.append(adopted(task.id));
    const second = ledger.events.append({ ...adopted(task.id), payload: { pid: 5122, cwd: "/x" } });

    const latest = ledger.events.latest("task.adopted");
    expect(latest?.id).toBe(second.id);
    expect(latest?.payload.pid).toBe(5122);
    // The newest of one kind, not the newest event: task.created came first and stays first.
    expect(ledger.events.latest("task.created")?.payload.task.id).toBe(task.id);
  });
});

describe("event ids across tables", () => {
  it("stay monotonic no matter which query wrote them, so after(cursor) sees only later ones", () => {
    ledger.repos.insert(repo);
    ledger.tasks.insert(task);
    ledger.usage.record(task.id, [
      {
        ts: "2026-09-10T12:10:00.000Z",
        harness: "claude-code",
        model: null,
        tokensInput: null,
        tokensOutput: null,
        tokensCacheRead: null,
        tokensCacheWrite: null,
        tokens: 100,
        costUsd: null,
        source: "transcript",
        ref: null,
      },
    ]);
    const outcome: Outcome = {
      taskId: task.id,
      testsBefore: null,
      testsAfter: null,
      accepted: null,
      reverted: null,
      agentLines: null,
      humanChangedLines: null,
      humanEditRatio: null,
      durationSec: 1,
      costUsd: null,
      tokens: 100,
      resolvedModel: null,
    };
    ledger.outcomes.record(outcome);

    const all = ledger.events.after(0);
    expect(all.map((event) => event.kind)).toEqual([
      "repo.registered",
      "task.created",
      "usage.recorded",
      "outcome.recorded",
    ]);
    const ids = all.map((event) => event.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);

    const [, taskCreatedId] = ids;
    const afterTaskCreated = ledger.events.after(taskCreatedId ?? 0);
    expect(afterTaskCreated.map((event) => event.kind)).toEqual([
      "usage.recorded",
      "outcome.recorded",
    ]);
  });
});
