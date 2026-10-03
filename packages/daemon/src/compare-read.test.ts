import type { ChangedFile, ChangesResponse, Task } from "@agnostic/core";
import { openLedger } from "@agnostic/ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pickedTaskId, summarizeChanges } from "./compare-read.js";

const now = "2026-09-23T10:00:00.000Z";

function changes(files: ChangedFile[]): ChangesResponse {
  return {
    task: {} as Task,
    base: { ref: "main", commit: "c0ffee1" },
    ahead: 1,
    behind: 0,
    uncommitted: 0,
    pushed: false,
    remote: null,
    files,
  };
}

describe("summarizeChanges", () => {
  it("counts every file and sums the lines a binary file does not have", () => {
    const summary = summarizeChanges(
      changes([
        {
          path: "src/parse.ts",
          status: "modified",
          state: "unstaged",
          additions: 12,
          deletions: 3,
        },
        {
          path: "docs/logo.png",
          status: "added",
          state: "staged",
          additions: null,
          deletions: null,
        },
        { path: "src/read.ts", status: "renamed", state: "committed", additions: 1, deletions: 1 },
      ]),
    );
    expect(summary).toEqual({ files: 3, additions: 13, deletions: 4 });
  });

  it("counts nothing for a branch with no change", () => {
    expect(summarizeChanges(changes([]))).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});

describe("pickedTaskId", () => {
  let ledger: ReturnType<typeof openLedger>;

  beforeEach(() => {
    ledger = openLedger(":memory:");
    ledger.repos.insert({
      id: "r3n9v2wxyz",
      path: "/tmp/petal",
      kind: "git",
      name: "petal",
      status: "active",
      addedAt: now,
    });
  });

  afterEach(() => ledger.close());

  const sibling = (id: string): Task =>
    ledger.tasks.insert({
      id,
      repoId: "r3n9v2wxyz",
      title: "try it",
      prompt: "try it",
      profileId: "claude-code:default:native",
      worktreePath: `/tmp/worktrees/${id}`,
      branch: `agn/try-${id}`,
      status: "stopped",
      origin: "agn",
      baseCommit: null,
      compareId: "cmp2nnnnnn",
      createdAt: now,
      updatedAt: now,
    });

  /** The row `readCompare` builds: the task, plus whether its worktree is on disk now. */
  const row = (task: Task, worktreePresent: boolean) => ({ id: task.id, worktreePresent });

  /** What a pick does to a loser: agn removes the worktree and records that it was agn. */
  const clean = (task: Task) => {
    ledger.tasks.clean(task.id, false);
    return row(task, false);
  };

  it("is null while every sibling still has its worktree", () => {
    const siblings = [sibling("aaaaaaaaaa"), sibling("bbbbbbbbbb")];
    expect(
      pickedTaskId(
        ledger,
        siblings.map((task) => row(task, true)),
      ),
    ).toBeNull();
  });

  it("names the one sibling left when every other one was cleaned", () => {
    const kept = sibling("aaaaaaaaaa");
    const loser = sibling("bbbbbbbbbb");
    expect(pickedTaskId(ledger, [row(kept, true), clean(loser)])).toBe(kept.id);
  });

  it("is null when every sibling was cleaned", () => {
    const siblings = [sibling("aaaaaaaaaa"), sibling("bbbbbbbbbb")];
    expect(pickedTaskId(ledger, siblings.map(clean))).toBeNull();
  });

  it("is null while two siblings are still standing", () => {
    const [first, second, third] = [
      sibling("aaaaaaaaaa"),
      sibling("bbbbbbbbbb"),
      sibling("cccccccccc"),
    ];
    const rows = [row(first, true), row(second, true), clean(third)];
    expect(pickedTaskId(ledger, rows)).toBeNull();
  });

  it("names the sibling whose worktree came back, which is what a repick plus a resume is", () => {
    const first = sibling("aaaaaaaaaa");
    const second = sibling("bbbbbbbbbb");
    // The first pick kept a and cleaned b; the second kept b, and a resume rebuilt its worktree.
    clean(second);
    expect(pickedTaskId(ledger, [clean(first), row(second, true)])).toBe(second.id);
  });

  it("ignores a worktree a person deleted, because agn never recorded removing it", () => {
    const kept = sibling("aaaaaaaaaa");
    const gone = sibling("bbbbbbbbbb");
    expect(pickedTaskId(ledger, [row(kept, true), row(gone, false)])).toBeNull();
  });
});
