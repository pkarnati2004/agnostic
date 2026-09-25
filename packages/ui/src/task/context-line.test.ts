import type { RepoListRow } from "@agnostic/core";
import { describe, expect, it } from "vitest";
import { contextLine } from "./context-line";

const REPO: RepoListRow = {
  id: "r1",
  path: "/repo",
  kind: "git",
  name: "petal",
  addedAt: "2026-09-14T10:00:00.000Z",
  status: "active",
  testCommand: null,
  pathPresent: true,
};

describe("contextLine", () => {
  it("names the machine, the repo and the worktree agn would make", () => {
    expect(contextLine(REPO)).toEqual(["This machine", "petal", "New worktree"]);
  });

  it("says a folder repo is edited in place, since there is no branch to leave", () => {
    expect(contextLine({ ...REPO, kind: "folder" })).toEqual(["This machine", "petal", "In place"]);
  });

  it("says there is no repo yet rather than leaving a gap", () => {
    expect(contextLine(null)).toEqual(["This machine", "No repo", "New worktree"]);
  });
});
