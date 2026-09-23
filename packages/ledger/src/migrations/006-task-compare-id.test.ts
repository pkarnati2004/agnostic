import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "@agnostic/core";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "../ledger.js";
import { migrate } from "../migrate.js";
import { initial } from "./001-initial.js";
import { taskBaseCommit } from "./002-task-base-commit.js";
import { repoStatus } from "./003-repo-status.js";
import { repoStatusRemoved } from "./004-repo-status-removed.js";
import { harnessIds } from "./005-harness-ids.js";

const now = "2026-09-23T10:00:00.000Z";
const REPO = "r3n9v2wxyz";

/** A database written by a build that knew the first five migrations and nothing after them. */
function version5Database(): string {
  const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
  const db = new Database(path);
  migrate(db, [initial, taskBaseCommit, repoStatus, repoStatusRemoved, harnessIds]);
  db.prepare("INSERT INTO repos (id, path, kind, name, added_at) VALUES (?, ?, ?, ?, ?)").run(
    REPO,
    "/tmp/petal",
    "git",
    "petal",
    now,
  );
  db.prepare(
    `INSERT INTO tasks (id, repo_id, title, prompt, profile_id, worktree_path, branch, status,
       origin, base_commit, session_json, recommendation_json, parent_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "t3n9v2wxyz",
    REPO,
    "split the parser",
    "split it",
    "claude-code:opus:native",
    "/tmp/worktree",
    "agn/split-t3n9v2wxyz",
    "done",
    "agn",
    "9f1c0de",
    null,
    null,
    null,
    now,
    now,
  );
  db.close();
  return path;
}

function insertTask(ledger: Ledger, id: string, compareId: string | null, at = now): Task {
  return ledger.tasks.insert({
    id,
    repoId: REPO,
    title: "try it",
    prompt: "try it",
    profileId: "claude-code:default:native",
    worktreePath: null,
    branch: null,
    status: "queued",
    origin: "agn",
    baseCommit: null,
    compareId,
    createdAt: at,
    updatedAt: at,
  });
}

describe("migration 006", () => {
  it("adds compare_id to a database written before it, keeping every row", () => {
    const ledger = openLedger(version5Database());
    const task = ledger.tasks.get("t3n9v2wxyz");
    expect(task?.title).toBe("split the parser");
    // A task that ran before `agn compare` existed belongs to no group.
    expect(task?.compareId).toBeNull();
    expect(ledger.tasks.list({ repoId: REPO })).toHaveLength(1);
    ledger.close();
  });

  it("reads back the compare a task was inserted with", () => {
    const ledger = openLedger(version5Database());
    expect(insertTask(ledger, "aaaaaaaaaa", "cmp2nnnnnn").compareId).toBe("cmp2nnnnnn");
    expect(ledger.tasks.get("aaaaaaaaaa")?.compareId).toBe("cmp2nnnnnn");
    ledger.close();
  });

  it("lists the siblings of one compare and no other row", () => {
    const ledger = openLedger(version5Database());
    insertTask(ledger, "aaaaaaaaaa", "cmp2nnnnnn", "2026-09-23T10:00:01.000Z");
    insertTask(ledger, "bbbbbbbbbb", "cmp2nnnnnn", "2026-09-23T10:00:02.000Z");
    insertTask(ledger, "cccccccccc", "cmp3nnnnnn", "2026-09-23T10:00:03.000Z");
    insertTask(ledger, "dddddddddd", null, "2026-09-23T10:00:04.000Z");

    const siblings = ledger.tasks.list({ compareId: "cmp2nnnnnn" });
    expect(siblings.map((task) => task.id)).toEqual(["bbbbbbbbbb", "aaaaaaaaaa"]);
    ledger.close();
  });

  it("lists distinct compare ids by prefix", () => {
    const ledger = openLedger(version5Database());
    insertTask(ledger, "aaaaaaaaaa", "cmp2nnnnnn");
    insertTask(ledger, "bbbbbbbbbb", "cmp2nnnnnn");
    insertTask(ledger, "cccccccccc", "cmp3nnnnnn");
    insertTask(ledger, "dddddddddd", null);

    expect(ledger.tasks.compareIds("cmp")).toEqual(["cmp2nnnnnn", "cmp3nnnnnn"]);
    expect(ledger.tasks.compareIds("cmp2")).toEqual(["cmp2nnnnnn"]);
    expect(ledger.tasks.compareIds("zzz")).toEqual([]);
    ledger.close();
  });
});
