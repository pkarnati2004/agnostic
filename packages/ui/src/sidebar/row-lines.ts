import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { isClosed } from "@agnostic/core/browser";
import { profileParts } from "../profile/profile-parts";

/** The second line of a sidebar row: what it says, whether it is an id, and in what colour. */
export type RowLine = { text: string; mono: boolean; tone: "muted" | "queued" | "failed" };

/**
 * The row's second line. A live task shows the branch it is on; a queued one what agn is doing
 * before the agent starts; a finished one the branch and how it ended. A folder task has no branch
 * of agn's, and "no branch" stands in for it.
 */
export function rowSecondLine(
  task: TaskListRow,
  repo: Pick<RepoListRow, "testCommand"> | null,
): RowLine {
  if (task.status === "queued") {
    const tests = repo?.testCommand ?? null;
    return {
      text: tests === null ? "Starting" : "Running tests before launch",
      mono: false,
      tone: "queued",
    };
  }
  const branch = task.branch ?? "no branch";
  if (isClosed(task.status)) {
    return {
      text: `${branch} · ${task.status}`,
      mono: true,
      tone: task.status === "failed" ? "failed" : "muted",
    };
  }
  return { text: branch, mono: true, tone: "muted" };
}

/** A task that came out of a handoff says where it came from, not what it is on: its parent's row
 * above it already says the branch they share. */
export function childLine(parentProfileId: string): RowLine {
  return { text: `From ${profileParts(parentProfileId).harness}`, mono: false, tone: "muted" };
}

/** What a row says for the ten seconds after you archive it, in place of its branch and status. */
export function archivedLine(): RowLine {
  return { text: "Archived just now", mono: false, tone: "muted" };
}
