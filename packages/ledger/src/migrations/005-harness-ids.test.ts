import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "../migrate.js";
import { initial } from "./001-initial.js";
import { taskBaseCommit } from "./002-task-base-commit.js";
import { repoStatus } from "./003-repo-status.js";
import { repoStatusRemoved } from "./004-repo-status-removed.js";
import { harnessIds } from "./005-harness-ids.js";

const now = "2026-09-21T10:00:00.000Z";
const REPO_ID = "r3n9v2wxyz";

const PROFILE_IDS = [
  "other:gemini:default:native",
  "other:cursor:default:native",
  "other:zzz:default:native",
  "claude-code:default:native",
];

function session(harness: string): string {
  return JSON.stringify({
    harness,
    sessionId: "sess-1",
    tmuxSession: "agn-1",
    cwd: "/tmp/petal",
    lastSeenAt: now,
  });
}

const recommendation = JSON.stringify({
  recommended: {
    profileId: "other:gemini:default:native",
    reason: "r",
    evidence: "some",
    sources: [],
  },
  alternative: { profileId: "other:zzz:default:native", reason: "r" },
  worthTrying: null,
  riskNote: null,
  taskClass: "feature",
});

/** A database at version 4, holding the ids agn wrote before every registry row got a plain one. */
function version4Database(): string {
  const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
  const db = new Database(path);
  migrate(db, [initial, taskBaseCommit, repoStatus, repoStatusRemoved]);
  db.prepare(
    "INSERT INTO repos (id, path, kind, name, added_at, status) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(REPO_ID, "/tmp/petal", "git", "petal", now, "active");
  const task = db.prepare(
    `INSERT INTO tasks (id, repo_id, title, prompt, profile_id, status, origin, session_json,
       recommendation_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  PROFILE_IDS.forEach((profileId, index) => {
    task.run(
      `t3n9v2wxy${index}`,
      REPO_ID,
      "ship it",
      "a prompt",
      profileId,
      "done",
      "agn",
      index === 0 ? session("other:gemini") : null,
      index === 0 ? recommendation : null,
      now,
      now,
    );
  });
  const usage = db.prepare(
    "INSERT INTO usage (ts, harness, model, tokens, source, ref) VALUES (?, ?, ?, ?, ?, ?)",
  );
  usage.run(now, "other:pi", null, 100, "hook", "ref-1");
  usage.run(now, "other:zzz", null, 20, "hook", "ref-2");
  db.close();
  return path;
}

function read(path: string) {
  const db = new Database(path, { readonly: true });
  const profileIds = (
    db.prepare("SELECT profile_id FROM tasks ORDER BY id").all() as { profile_id: string }[]
  ).map((row) => row.profile_id);
  const harnesses = (
    db.prepare("SELECT harness FROM usage ORDER BY ref").all() as { harness: string }[]
  ).map((row) => row.harness);
  const first = db
    .prepare("SELECT session_json, recommendation_json FROM tasks WHERE id = 't3n9v2wxy0'")
    .get() as { session_json: string; recommendation_json: string };
  db.close();
  return {
    profileIds,
    harnesses,
    session: JSON.parse(first.session_json) as { harness: string; sessionId: string },
    recommendation: JSON.parse(first.recommendation_json) as {
      recommended: { profileId: string; reason: string };
      alternative: { profileId: string };
    },
  };
}

function applyMigration(path: string): void {
  const db = new Database(path);
  migrate(db, [initial, taskBaseCommit, repoStatus, repoStatusRemoved, harnessIds]);
  db.close();
}

describe("migration 005", () => {
  it("drops other: from every id the registry now has a row for, and renames cursor", () => {
    const path = version4Database();
    applyMigration(path);
    const after = read(path);

    expect(after.profileIds).toEqual([
      "gemini:default:native",
      "cursor-agent:default:native",
      // An id agn has no row for still means "an executable agn knows nothing about".
      "other:zzz:default:native",
      "claude-code:default:native",
    ]);
    expect(after.harnesses).toEqual(["pi", "other:zzz"]);
    expect(after.session).toMatchObject({ harness: "gemini", sessionId: "sess-1" });
    expect(after.recommendation.recommended).toMatchObject({
      profileId: "gemini:default:native",
      reason: "r",
    });
    expect(after.recommendation.alternative.profileId).toBe("other:zzz:default:native");
  });

  it("changes nothing when it is run again", () => {
    const path = version4Database();
    applyMigration(path);
    const once = read(path);
    const db = new Database(path);
    db.exec(harnessIds.sql);
    db.close();
    expect(read(path)).toEqual(once);
  });

  it("leaves a database with nothing to rewrite alone", () => {
    const path = join(mkdtempSync(join(tmpdir(), "agn-migration-")), "agnostic.db");
    const db = new Database(path);
    expect(
      migrate(db, [initial, taskBaseCommit, repoStatus, repoStatusRemoved, harnessIds]),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  });
});
