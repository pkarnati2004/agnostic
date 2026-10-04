import { describe, expect, it } from "vitest";
import { archiveWarning } from "./archive-copy";

describe("archiveWarning", () => {
  it("counts the files and names the branch the commits are on", () => {
    const warning = archiveWarning("it has uncommitted changes", 3, "agn/invite-links");
    expect(warning.title).toBe("3 files are not committed. Archive anyway?");
    expect(warning.body).toBe(
      "Archiving deletes them with the worktree. Committed work on `agn/invite-links` is kept.",
    );
  });

  it("says one file in the singular", () => {
    expect(archiveWarning("it has uncommitted changes", 1, "agn/one").title).toBe(
      "1 file is not committed. Archive anyway?",
    );
  });

  it("falls back to the daemon's reason when there is no count to give", () => {
    expect(archiveWarning("a merge is in progress", null, "agn/one").title).toBe(
      "A merge is in progress. Archive anyway?",
    );
  });

  it("drops the branch sentence for a task with no branch of agn's", () => {
    expect(archiveWarning("it has uncommitted changes", 2, null).body).toBe(
      "Archiving deletes them with the worktree.",
    );
  });
});
