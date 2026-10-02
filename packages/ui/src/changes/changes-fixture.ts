import type { ChangedFile, ChangesResponse, TaskListRow } from "@agnostic/core";

export function taskRow(over: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id: "task1",
    repoId: "repo1",
    title: "Add the invite links",
    prompt: "add invite links",
    profileId: "claude-code:sonnet-4.5:native",
    worktreePath: "/tmp/wt/task1",
    branch: "agn/invite-links-a1b2",
    status: "running",
    origin: "agn",
    baseCommit: "c0ffee1",
    compareId: null,
    createdAt: "2026-09-20T09:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    worktreePresent: true,
    ...over,
  };
}

export const FILES: ChangedFile[] = [
  { path: "src/invite.ts", status: "modified", state: "unstaged", additions: 42, deletions: 3 },
  { path: "src/invite.test.ts", status: "added", state: "unstaged", additions: 80, deletions: 0 },
  {
    path: "docs/invites.md",
    status: "untracked",
    state: "unstaged",
    additions: null,
    deletions: null,
  },
];

/** One of each state, in the order the daemon sends them. */
export const MIXED_FILES: ChangedFile[] = [
  { path: "src/invite.ts", status: "modified", state: "unstaged", additions: 42, deletions: 3 },
  {
    path: "docs/invites.md",
    status: "untracked",
    state: "unstaged",
    additions: null,
    deletions: null,
  },
  { path: "src/invite.test.ts", status: "added", state: "staged", additions: 80, deletions: 0 },
  { path: "src/links.ts", status: "modified", state: "committed", additions: 7, deletions: 1 },
  { path: "docs/links.md", status: "added", state: "committed", additions: 12, deletions: 0 },
];

export function changesResponse(over: Partial<ChangesResponse> = {}): ChangesResponse {
  return {
    task: taskRow(),
    base: { ref: "main", commit: "c0ffee1" },
    ahead: 3,
    behind: 0,
    uncommitted: 3,
    pushed: false,
    remote: "git@github.com:agn/petal.git",
    files: FILES,
    ...over,
  };
}
