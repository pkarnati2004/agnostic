import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openLedger } from "../ledger.js";
import { migrate } from "../migrate.js";
import { initial } from "./001-initial.js";

const now = "2026-09-12T10:00:00.000Z";

/** A database written by a build that knew only the first migration. */
function version1Database(): string {
  const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
  const db = new Database(path);
  migrate(db, [initial]);
  db.prepare("INSERT INTO repos VALUES (?, ?, ?, ?, ?)").run(
    "r3n9v2wxyz",
    "/tmp/petal",
    "git",
    "petal",
    now,
  );
  db.prepare(
    `INSERT INTO tasks (id, repo_id, title, prompt, profile_id, worktree_path, branch, status,
       origin, session_json, recommendation_json, parent_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "t3n9v2wxyz",
    "r3n9v2wxyz",
    "split the parser",
    "split it",
    "claude-code:opus:native",
    "/tmp/worktree",
    "agn/split-t3n9v2wxyz",
    "done",
    "agn",
    null,
    null,
    null,
    now,
    now,
  );
  db.close();
  return path;
}

describe("migration 002", () => {
  it("adds base_commit to a database written before it, keeping every row", () => {
    const ledger = openLedger(version1Database());
    const task = ledger.tasks.get("t3n9v2wxyz");
    expect(task?.title).toBe("split the parser");
    // A task that ran before agn recorded the base has none, and everything derived from it is null.
    expect(task?.baseCommit).toBeNull();
    expect(ledger.tasks.list({ repoId: "r3n9v2wxyz" })).toHaveLength(1);
    ledger.close();
  });

  it("keeps the base a later launch writes", () => {
    const ledger = openLedger(version1Database());
    const started = ledger.tasks.start("t3n9v2wxyz", {
      branch: "agn/split-t3n9v2wxyz",
      baseCommit: "9f1c0de",
      session: {
        harness: "claude-code",
        sessionId: null,
        tmuxSession: "agn-t3n9v2wxyz",
        tmuxSocket: "agn",
        launchId: "l1",
        pid: null,
        cwd: "/tmp/worktree",
        lastSeenAt: now,
      },
    });
    expect(started.baseCommit).toBe("9f1c0de");
    expect(ledger.tasks.get("t3n9v2wxyz")?.baseCommit).toBe("9f1c0de");
    ledger.close();
  });

  it("keeps the base a first start recorded when a relaunch has none to report", () => {
    const ledger = openLedger(version1Database());
    const session = {
      harness: "claude-code" as const,
      sessionId: null,
      tmuxSession: "agn-t3n9v2wxyz",
      tmuxSocket: "agn",
      launchId: "l1",
      pid: null,
      cwd: "/tmp/worktree",
      lastSeenAt: now,
    };
    ledger.tasks.start("t3n9v2wxyz", {
      branch: "agn/split-t3n9v2wxyz",
      baseCommit: "9f1c0de",
      session,
    });

    // A relaunch into the same worktree has no base of its own; the one already on the row stands.
    const relaunched = ledger.tasks.start("t3n9v2wxyz", {
      branch: "agn/split-t3n9v2wxyz",
      baseCommit: null,
      session,
    });
    expect(relaunched.baseCommit).toBe("9f1c0de");
    expect(ledger.tasks.get("t3n9v2wxyz")?.baseCommit).toBe("9f1c0de");
    ledger.close();
  });
});
