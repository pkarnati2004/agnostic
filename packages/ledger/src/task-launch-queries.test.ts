import type { Repo, Task, TaskSession } from "@agnostic/core";
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

const session: TaskSession = {
  harness: "claude-code",
  sessionId: "b7d1f0e2",
  tmuxSession: "agn-t3n9v2wxyz",
  tmuxSocket: "agn",
  launchId: null,
  pid: null,
  cwd: "/Users/dev/code/agnostic",
  lastSeenAt: "2026-09-10T12:31:00.000Z",
};

let ledger: Ledger;

beforeEach(() => {
  ledger = openLedger(":memory:");
  ledger.repos.insert(repo);
});

afterEach(() => {
  ledger.close();
});

describe("tasks.start", () => {
  it("writes branch, session and running status with both events in one transaction", () => {
    ledger.tasks.insert(task);
    const started = ledger.tasks.start(task.id, {
      branch: "agn/split-t3n9v2wxyz",
      baseCommit: "abc1234",
      session,
    });
    expect(started.status).toBe("running");
    expect(started.branch).toBe("agn/split-t3n9v2wxyz");
    expect(started.session).toEqual(session);
    expect(ledger.tasks.get(task.id)).toEqual(started);
    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "session.captured",
      "task.status",
    ]);
  });

  it("skips the status event when the task is already running", () => {
    ledger.tasks.insert({ ...task, status: "running" });
    ledger.tasks.start(task.id, { branch: null, baseCommit: null, session });
    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "session.captured",
    ]);
  });
});

describe("tasks.startWaiting", () => {
  it("writes branch and base commit, waits, and captures no session", () => {
    ledger.tasks.insert(task);
    const waiting = ledger.tasks.startWaiting(task.id, {
      branch: "agn/wireframe-t3n9v2wxyz",
      baseCommit: "abc1234",
    });
    expect(waiting.status).toBe("waiting");
    expect(waiting.branch).toBe("agn/wireframe-t3n9v2wxyz");
    expect(waiting.baseCommit).toBe("abc1234");
    expect(waiting.session).toBeUndefined();
    expect(ledger.tasks.get(task.id)).toEqual(waiting);
    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual([
      "task.created",
      "task.status",
    ]);
  });

  it("skips the status event when the task is already waiting", () => {
    ledger.tasks.insert({ ...task, status: "waiting" });
    ledger.tasks.startWaiting(task.id, { branch: null, baseCommit: null });
    expect(ledger.events.forTask(task.id).map((event) => event.kind)).toEqual(["task.created"]);
  });
});
