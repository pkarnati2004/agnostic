import { z } from "zod";
import type { Editor } from "./editor.js";
import type { Task } from "./task.js";

export type ChangedFileStatus = "added" | "modified" | "deleted" | "renamed" | "untracked";

/** Where a row's change sits: unstaged (the working tree differs from the index; untracked
 * included), staged (the index differs from HEAD and the tree matches it), committed (on the
 * branch, nothing pending). Every row is committed when the changes are read from the main
 * checkout. */
export type ChangedFileState = "unstaged" | "staged" | "committed";

/** Counts are null for a binary file. */
export type ChangedFile = {
  path: string;
  status: ChangedFileStatus;
  state: ChangedFileState;
  additions: number | null;
  deletions: number | null;
};

export type ChangesResponse = {
  task: Task;
  /** `ref` is what the branch is judged against (a branch name); `commit` is the diff base: the
   * merge-base of ref and the branch's tip, else `task.baseCommit`. */
  base: { ref: string; commit: string | null };
  /** Commits on the branch since `base.commit`. */
  ahead: number;
  /** Commits on the base the branch does not have, counted against whichever of `base.ref` and
   * `origin/<base.ref>` is ahead; null when neither resolves. */
  behind: number | null;
  /** The branch's tip is in the base: nothing left to review, push or bring up to date.
   * `behind` can stay above 0 for a branch merged with `--no-ff`, since the merge commit is not in
   * the tip; the panel and the CLI hide it when this is true. */
  merged: boolean;
  /** Paths with working-tree changes (`git status --porcelain` entries, untracked included);
   * 0 when the task's changes are read from the main checkout. */
  uncommitted: number;
  /** The branch has an upstream: its history was published, so bringing it up to date merges. */
  pushed: boolean;
  /** `git remote get-url origin`, null when there is no origin. */
  remote: string | null;
  /** Ordered unstaged, then staged, then committed; git's own order within a group. */
  files: ChangedFile[];
};

/** A path is relative to the repo root as `files[].path` prints it, and stays inside it. */
function isRepoRelative(path: string): boolean {
  if (path.startsWith("/") || path.includes("\0")) {
    return false;
  }
  return !path.split("/").includes("..");
}

export const DiffQuerySchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .refine(isRepoRelative, "must be a path inside the repo, as the changes list prints it"),
});
export type DiffQuery = z.infer<typeof DiffQuerySchema>;

/** git's own unified patch for one path, `""` when the path has no change; a binary file's patch
 * is git's `Binary files ... differ` line. */
export type DiffResponse = { patch: string };

/** The answer to `POST /tasks/:id/open`: the editor the daemon started, and what it opened. */
export type OpenedTaskResponse = { editor: Editor; dir: string };
