import type { ChangedFile } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { taskRow } from "../changes/changes-fixture";
import { busyLabel, deleteCopy } from "./delete-task-copy";

function uncommitted(count: number): ChangedFile[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `src/file${index}.ts`,
    status: "modified" as const,
    state: "unstaged" as const,
    additions: 1,
    deletions: 0,
  }));
}

describe("deleteCopy", () => {
  it("names what goes and what stays", () => {
    const copy = deleteCopy(taskRow({ status: "stopped" }), "petal", null);
    expect(copy.title).toBe("Delete Add the invite links?");
    expect(copy.body).toBe(
      "This removes the task's worktree and every agn record for it: the task, its events and " +
        "its outcome. The branch `agn/invite-links-a1b2` stays in petal. The tokens this task " +
        "used stay in the usage totals.",
    );
    expect(copy.warning).toBeNull();
  });

  it("drops the worktree clause for a task whose worktree has already gone", () => {
    const copy = deleteCopy(taskRow({ status: "done", worktreePresent: false }), "petal", null);
    expect(copy.body).toContain("This removes every agn record for the task:");
    expect(copy.body).not.toContain("worktree and every");
  });

  it("drops the branch sentence for a task with no branch of agn's", () => {
    const folder = taskRow({
      status: "done",
      worktreePath: null,
      worktreePresent: false,
      branch: null,
    });
    expect(deleteCopy(folder, "petal", null).body).not.toContain("The branch");
  });

  it("warns about the uncommitted files and names the first two", () => {
    const copy = deleteCopy(taskRow({ status: "stopped" }), "petal", uncommitted(5));
    expect(copy.warning).toBe("5 uncommitted files in the worktree will be lost.");
    expect(copy.files).toEqual(["src/file0.ts", "src/file1.ts"]);
    expect(copy.more).toBe(3);
  });

  it("counts one file in the singular and leaves nothing out", () => {
    const copy = deleteCopy(taskRow({ status: "stopped" }), "petal", uncommitted(1));
    expect(copy.warning).toBe("1 uncommitted file in the worktree will be lost.");
    expect(copy.more).toBe(0);
  });
});

describe("busyLabel", () => {
  it("names the removal while there is a worktree, and the rows alone when there is not", () => {
    expect(busyLabel({ worktreePresent: true })).toBe("Removing the worktree…");
    expect(busyLabel({ worktreePresent: false })).toBe("Deleting…");
  });
});
