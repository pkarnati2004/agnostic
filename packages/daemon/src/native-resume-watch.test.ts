import type { Task, TaskSession } from "@agnostic/core";
import { type Ledger, openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Logger } from "./log.js";
import { createNativeResumeWatch, type NativeResumeWatch } from "./native-resume-watch.js";

const REPO = "r7k2m4pqrs";
const TASK = "t3n9v2wxyz";
const SESSION_ID = "0199a1b2-c3d4-7e8f-9012-3456789abcde";

let ledger: Ledger;
let warnings: string[];
let watch: NativeResumeWatch;

beforeEach(() => {
  ledger = openLedger(":memory:");
  warnings = [];
  watch = createNativeResumeWatch({ ledger, log: stubLog() });
  const now = new Date().toISOString();
  ledger.repos.insert({
    id: REPO,
    path: "/tmp/petal",
    kind: "git",
    name: "petal",
    addedAt: now,
    status: "active",
  });
  ledger.tasks.insert({
    id: TASK,
    repoId: REPO,
    title: "add a --verbose flag",
    prompt: "add it",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    createdAt: now,
    updatedAt: now,
  });
});

afterEach(() => ledger.close());

function stubLog(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: (msg) => warnings.push(msg),
    error: () => undefined,
    close: () => undefined,
  };
}

/** A task started the way a native resume starts one: the recorded id carried into a new launch. */
function started(launchId: string): Task {
  const session: TaskSession = {
    harness: "claude-code",
    sessionId: SESSION_ID,
    tmuxSession: `agn-${TASK}`,
    tmuxSocket: "agn-test",
    launchId,
    pid: null,
    cwd: "/tmp/petal-worktree",
    lastSeenAt: new Date().toISOString(),
  };
  return ledger.tasks.start(TASK, { branch: "agn/verbose", baseCommit: null, session });
}

function settle(to: "failed" | "stopped"): Task {
  return ledger.tasks.setStatus(TASK, to);
}

function sessionEvents(): number {
  return ledger.events.forTask(TASK).filter((event) => event.kind === "session.captured").length;
}

describe("the belt behind a native resume", () => {
  it("clears the id when the launch it was handed to failed before any hook", () => {
    started("launch-1");
    watch.launched(TASK, "launch-1");
    const before = sessionEvents();

    watch.closed(settle("failed"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBeNull();
    expect(sessionEvents()).toBe(before + 1);
    expect(warnings).toEqual(["resumed session id cleared"]);
  });

  it("keeps the id when a hook proved the harness came up on it", () => {
    started("launch-1");
    watch.launched(TASK, "launch-1");
    watch.hookSeen(TASK);

    watch.closed(settle("failed"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBe(SESSION_ID);
    expect(warnings).toEqual([]);
  });

  it("keeps the id when the user stopped the task instead", () => {
    started("launch-1");
    watch.launched(TASK, "launch-1");

    watch.closed(settle("stopped"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBe(SESSION_ID);
  });

  it("keeps the id when the launch that failed is a later one", () => {
    started("launch-1");
    watch.launched(TASK, "launch-1");
    // A second resume took the same tmux session name; this failure is that launch's, not ours.
    started("launch-2");

    watch.closed(settle("failed"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBe(SESSION_ID);
  });

  it("writes nothing for a task that was never resumed natively", () => {
    started("launch-1");
    const before = sessionEvents();

    watch.closed(settle("failed"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBe(SESSION_ID);
    expect(sessionEvents()).toBe(before);
    expect(warnings).toEqual([]);
  });

  it("survives closing a task whose row never had a session at all", () => {
    // A queued task the daemon never got to launch (ADR 014's amendment) fails with no session.
    const before = sessionEvents();

    expect(() => watch.closed(settle("failed"))).not.toThrow();

    expect(ledger.tasks.get(TASK)?.session).toBeUndefined();
    expect(sessionEvents()).toBe(before);
    expect(warnings).toEqual([]);
  });

  it("is harmless for a hook that names a task the watch never saw launched", () => {
    expect(() => watch.hookSeen("some-other-task-id")).not.toThrow();
    // Confirms the unknown call left no trace behind for a real launch that follows it.
    started("launch-1");
    watch.launched(TASK, "launch-1");

    watch.closed(settle("failed"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBeNull();
  });

  it("keeps two natively resumed tasks separate, clearing one and leaving the other", () => {
    const OTHER_TASK = "u4p7w3xyza";
    const now = new Date().toISOString();
    ledger.tasks.insert({
      id: OTHER_TASK,
      repoId: REPO,
      title: "add a --quiet flag",
      prompt: "add it",
      profileId: "claude-code:default:native",
      worktreePath: null,
      branch: null,
      status: "queued",
      origin: "agn",
      baseCommit: null,
      createdAt: now,
      updatedAt: now,
    });
    const otherSession: TaskSession = {
      harness: "claude-code",
      sessionId: "0199a1b2-other-session-id",
      tmuxSession: `agn-${OTHER_TASK}`,
      tmuxSocket: "agn-test",
      launchId: "launch-other",
      pid: null,
      cwd: "/tmp/petal-worktree-2",
      lastSeenAt: now,
    };
    ledger.tasks.start(OTHER_TASK, {
      branch: "agn/quiet",
      baseCommit: null,
      session: otherSession,
    });
    watch.launched(OTHER_TASK, "launch-other");
    started("launch-1");
    watch.launched(TASK, "launch-1");

    watch.closed(ledger.tasks.setStatus(TASK, "failed"));

    expect(ledger.tasks.get(TASK)?.session?.sessionId).toBeNull();
    expect(ledger.tasks.get(OTHER_TASK)?.session?.sessionId).toBe("0199a1b2-other-session-id");

    watch.closed(ledger.tasks.setStatus(OTHER_TASK, "failed"));

    expect(ledger.tasks.get(OTHER_TASK)?.session?.sessionId).toBeNull();
  });
});
