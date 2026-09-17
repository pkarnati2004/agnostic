import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type Ledger, openLedger } from "../ledger.js";
import { migrate } from "../migrate.js";
import { initial } from "./001-initial.js";
import { taskBaseCommit } from "./002-task-base-commit.js";
import { repoStatus } from "./003-repo-status.js";

const now = "2026-09-17T10:00:00.000Z";
const REPO_ID = "r3n9v2wxyz";
const TASK_ID = "t3n9v2wxyz";

/** A v3 database holding one repo and the task, usage and outcome rows a real repo accumulates. */
function version3Database(): string {
  const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
  const db = new Database(path);
  migrate(db, [initial, taskBaseCommit, repoStatus]);
  db.prepare(
    "INSERT INTO repos (id, path, kind, name, added_at, status) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(REPO_ID, "/tmp/petal", "git", "petal", now, "active");
  db.prepare(
    `INSERT INTO tasks (id, repo_id, title, prompt, profile_id, worktree_path, branch, status,
       origin, base_commit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    TASK_ID,
    REPO_ID,
    "ship it",
    "a prompt",
    "claude-code:sonnet-4.5:native",
    null,
    null,
    "done",
    "agn",
    null,
    now,
    now,
  );
  db.prepare(
    `INSERT INTO usage (ts, task_id, harness, model, tokens, tokens_input, tokens_output,
       tokens_cache_read, tokens_cache_write, cost_usd, source, ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    now,
    TASK_ID,
    "claude-code",
    "claude-sonnet-4-5",
    100,
    60,
    40,
    null,
    null,
    0.02,
    "hook",
    "ref-1",
  );
  db.prepare(
    `INSERT INTO outcomes (task_id, tests_before, tests_after, accepted, reverted, agent_lines,
       human_changed_lines, human_edit_ratio, duration_sec, cost_usd, tokens, resolved_model,
       recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(TASK_ID, 1, 1, 1, 0, 40, 10, 0.25, 120, 0.02, 100, "claude-sonnet-4-5", now);
  db.close();
  return path;
}

let ledger: Ledger;

afterEach(() => {
  ledger.close();
});

describe("migration 004", () => {
  it("keeps every repo, task, usage and outcome row unchanged, with no dangling foreign key", () => {
    const path = version3Database();
    ledger = openLedger(path);

    expect(ledger.repos.get(REPO_ID)).toMatchObject({ name: "petal", status: "active" });
    expect(ledger.tasks.get(TASK_ID)).toMatchObject({ status: "done", repoId: REPO_ID });
    expect(ledger.usage.sumForTask(TASK_ID).tokens).toBe(100);
    expect(ledger.outcomes.get(TASK_ID)).toMatchObject({ accepted: true, tokens: 100 });

    const check = new Database(path, { readonly: true });
    expect(check.pragma("foreign_key_check")).toEqual([]);
    check.close();
  });

  it("removes the migrated repo and writes one repo.updated with status removed", () => {
    ledger = openLedger(version3Database());
    const latest = ledger.events.latestId();
    const removed = ledger.repos.update(REPO_ID, { status: "removed" });
    expect(removed.status).toBe("removed");
    expect(ledger.repos.get(REPO_ID)?.status).toBe("removed");

    const events = ledger.events.after(latest);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "repo.updated",
      payload: { repo: { status: "removed" } },
    });
  });

  it("still refuses a status the widened CHECK does not name", () => {
    const path = version3Database();
    ledger = openLedger(path);
    const db = new Database(path);
    expect(() =>
      db.prepare("UPDATE repos SET status = 'gone' WHERE id = ?").run(REPO_ID),
    ).toThrowError(/CHECK constraint failed/);
    db.close();
  });

  it("keeps path UNIQUE across the rebuild", () => {
    ledger = openLedger(version3Database());
    expect(() =>
      ledger.repos.insert({
        id: "r7k2m4pqrs",
        path: "/tmp/petal",
        kind: "git",
        name: "petal-2",
        addedAt: now,
        status: "active",
      }),
    ).toThrowError(expect.objectContaining({ code: "repo-exists" }));
  });

  it("inserts a fresh row as active in a brand-new database, keeping the DEFAULT clause", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
    ledger = openLedger(path);
    const db = new Database(path);
    db.prepare("INSERT INTO repos (id, path, kind, name, added_at) VALUES (?, ?, ?, ?, ?)").run(
      "r7k2m4pqrs",
      "/tmp/rose",
      "git",
      "rose",
      now,
    );
    db.close();
    expect(ledger.repos.get("r7k2m4pqrs")?.status).toBe("active");
  });
});
