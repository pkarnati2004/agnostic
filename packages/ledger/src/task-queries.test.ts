import {
  type Recommendation,
  type Repo,
  type Task,
  TaskSchema,
  type TaskSession,
} from "@agnostic/core";
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

const other: Repo = { ...repo, id: "q4m8n2vwxy", path: "/Users/dev/code/notes", name: "notes" };

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
  createdAt: "2026-09-10T12:00:00.000Z",
  updatedAt: "2026-09-10T12:00:00.000Z",
};

const recommendation: Recommendation = {
  recommended: {
    profileId: "codex:gpt-5:native",
    reason: "stronger on test repair",
    evidence: "some",
    sources: ["swe-bench-verified"],
  },
  alternative: { profileId: "claude-code:sonnet-4.5:native", reason: "cheaper" },
  worthTrying: null,
  riskNote: null,
  taskClass: {
    intent: "refactor",
    scope: "small",
    risk: [],
    needsBrowser: false,
    automaticIntent: null,
  },
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

describe("tasks.insert", () => {
  it("round-trips a task with a recommendation, a parent and a session", () => {
    const parent = ledger.tasks.insert({ ...task, id: "p4k8m2qrst" });
    const full: Task = {
      ...task,
      worktreePath: "/Users/dev/.agnostic/worktrees/r7k2m4pqrs/t3n9v2wxyz",
      branch: "agn/t3n9v2wxyz",
      origin: "adopted",
      baseCommit: null,
      recommendation,
      session,
      parentTaskId: parent.id,
    };
    expect(ledger.tasks.insert(full)).toEqual(full);
    expect(ledger.tasks.get(full.id)).toEqual(full);
  });

  it("writes task.created carrying the task", () => {
    ledger.tasks.insert(task);
    expect(ledger.events.forTask(task.id)[0]).toMatchObject({
      kind: "task.created",
      repoId: repo.id,
      payload: { task },
    });
  });

  it("refuses an unknown repo and a duplicate id, leaving no event behind either time", () => {
    ledger.tasks.insert(task);
    const latest = ledger.events.latestId();
    expect(() =>
      ledger.tasks.insert({ ...task, id: "p4k8m2qrst", repoId: "z9z9z9z9z9" }),
    ).toThrowError(expect.objectContaining({ code: "repo-not-found" }));
    expect(ledger.events.latestId()).toBe(latest);
    expect(() => ledger.tasks.insert(task)).toThrowError(
      expect.objectContaining({ code: "task-exists" }),
    );
    expect(ledger.events.latestId()).toBe(latest);
  });

  it("defaults origin to agn when a fixture omits it, the way TaskSchema.parse does", () => {
    const { origin: _origin, ...withoutOrigin } = task;
    const defaulted = TaskSchema.parse(withoutOrigin);
    expect(defaulted.origin).toBe("agn");
    expect(ledger.tasks.insert(defaulted)).toEqual(defaulted);
    expect(ledger.tasks.get(task.id)?.origin).toBe("agn");
  });
});

describe("tasks.list", () => {
  beforeEach(() => {
    ledger.repos.insert(other);
    ledger.tasks.insert(task);
    ledger.tasks.insert({
      ...task,
      id: "p4k8m2qrst",
      status: "done",
      createdAt: "2026-09-10T13:00:00.000Z",
    });
    ledger.tasks.insert({
      ...task,
      id: "w2n7k4vxyz",
      repoId: other.id,
      status: "running",
      createdAt: "2026-09-10T14:00:00.000Z",
    });
  });

  const ids = (filter?: Parameters<Ledger["tasks"]["list"]>[0]) =>
    ledger.tasks.list(filter).map((found) => found.id);

  it("orders by createdAt descending", () => {
    expect(ids()).toEqual(["w2n7k4vxyz", "p4k8m2qrst", "t3n9v2wxyz"]);
  });

  it("filters by repo, one status, a status list and an id prefix", () => {
    expect(ids({ repoId: other.id })).toEqual(["w2n7k4vxyz"]);
    expect(ids({ status: "done" })).toEqual(["p4k8m2qrst"]);
    expect(ids({ status: ["done", "running"] })).toEqual(["w2n7k4vxyz", "p4k8m2qrst"]);
    expect(ids({ idPrefix: "t3n" })).toEqual(["t3n9v2wxyz"]);
    expect(ids({ idPrefix: "zz" })).toEqual([]);
  });

  it("honors the limit and combines filters", () => {
    expect(ids({ limit: 2 })).toEqual(["w2n7k4vxyz", "p4k8m2qrst"]);
    expect(ids({ repoId: repo.id, status: ["queued", "done"], limit: 1 })).toEqual(["p4k8m2qrst"]);
  });
});

describe("tasks.setStatus", () => {
  beforeEach(() => {
    ledger.tasks.insert(task);
  });

  it("moves the status, bumps updatedAt and writes task.status", () => {
    const running = ledger.tasks.setStatus(task.id, "running");
    expect(running.status).toBe("running");
    expect(running.updatedAt > task.updatedAt).toBe(true);
    expect(ledger.tasks.get(task.id)).toEqual(running);

    const [, status] = ledger.events.forTask(task.id);
    expect(status).toMatchObject({
      kind: "task.status",
      taskId: task.id,
      repoId: repo.id,
      payload: { from: "queued", to: "running" },
    });
  });

  it("writes nothing when the task already has that status", () => {
    const running = ledger.tasks.setStatus(task.id, "running");
    const latest = ledger.events.latestId();
    expect(ledger.tasks.setStatus(task.id, "running")).toEqual(running);
    expect(ledger.events.latestId()).toBe(latest);
  });

  it("refuses an unknown task", () => {
    expect(() => ledger.tasks.setStatus("z9z9z9z9z9", "done")).toThrowError(
      expect.objectContaining({ code: "task-not-found" }),
    );
  });
});

describe("tasks.setSession", () => {
  it("round-trips the session and writes session.captured", () => {
    ledger.tasks.insert(task);
    const captured = ledger.tasks.setSession(task.id, session);
    expect(captured.session).toEqual(session);
    expect(ledger.tasks.get(task.id)).toEqual(captured);

    const [, event] = ledger.events.forTask(task.id);
    expect(event).toMatchObject({ kind: "session.captured", payload: { session } });
  });

  it("refuses an unknown task", () => {
    expect(() => ledger.tasks.setSession("z9z9z9z9z9", session)).toThrowError(
      expect.objectContaining({ code: "task-not-found" }),
    );
  });
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

describe("tasks.clean", () => {
  it("records the removed worktree and keeps the row's path and branch", () => {
    ledger.tasks.insert({ ...task, worktreePath: "/w/t3n9v2wxyz", branch: "agn/split" });
    const cleaned = ledger.tasks.clean(task.id, true);
    expect(cleaned.worktreePath).toBe("/w/t3n9v2wxyz");
    expect(cleaned.branch).toBe("agn/split");
    const event = ledger.events.forTask(task.id).at(-1);
    expect(event?.kind).toBe("task.cleaned");
    expect(event?.payload).toEqual({ deletedBranch: true });
  });

  it("records a branch that was kept as well as one that was deleted", () => {
    ledger.tasks.insert({ ...task, worktreePath: "/w/t3n9v2wxyz", branch: "agn/split" });
    const cleaned = ledger.tasks.clean(task.id, false);
    expect(cleaned.branch).toBe("agn/split");
    const event = ledger.events.forTask(task.id).at(-1);
    expect(event?.kind).toBe("task.cleaned");
    expect(event?.payload).toEqual({ deletedBranch: false });
  });

  it("writes the row change and the event in the same transaction", () => {
    ledger.tasks.insert({ ...task, worktreePath: "/w/t3n9v2wxyz", branch: "agn/split" });
    const before = ledger.events.forTask(task.id).length;
    ledger.tasks.clean(task.id, true);
    expect(ledger.events.forTask(task.id)).toHaveLength(before + 1);
    // The row and its event agree on what happened; neither could have been written alone.
    expect(ledger.tasks.get(task.id)?.updatedAt).toBe(ledger.events.forTask(task.id).at(-1)?.ts);
  });

  it("records another task.cleaned event for a task cleaned a second time", () => {
    ledger.tasks.insert({ ...task, worktreePath: "/w/t3n9v2wxyz", branch: "agn/split" });
    ledger.tasks.clean(task.id, false);
    ledger.tasks.clean(task.id, true);
    const cleaned = ledger.events.forTask(task.id).filter((event) => event.kind === "task.cleaned");
    expect(cleaned).toHaveLength(2);
    expect(cleaned.map((event) => event.payload)).toEqual([
      { deletedBranch: false },
      { deletedBranch: true },
    ]);
  });

  it("refuses an unknown task", () => {
    expect(() => ledger.tasks.clean("z9z9z9z9z9", false)).toThrowError(
      expect.objectContaining({ code: "task-not-found" }),
    );
  });
});
