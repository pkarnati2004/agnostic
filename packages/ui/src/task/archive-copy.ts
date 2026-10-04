/** How an archive ended. `unsaved` is answered in place rather than as a failure (ADR 037). */
export type ArchiveOutcome =
  | { kind: "archived" }
  | { kind: "unsaved"; reason: string; uncommitted: number | null }
  | { kind: "failed" };

/** The card the menu and the task header draw when the daemon held the worktree back. */
export type ArchiveWarning = { title: string; body: string };

/**
 * What to say about a worktree the daemon would not remove. With a file count the title names it;
 * with none - a merge or a rebase in progress, or a Changes read that failed - the daemon's own
 * reason stands in for it.
 */
export function archiveWarning(
  reason: string,
  uncommitted: number | null,
  branch: string | null,
): ArchiveWarning {
  const title = uncommitted === null ? capitalised(reason) : counted(uncommitted);
  const kept = branch === null ? "" : ` Committed work on \`${branch}\` is kept.`;
  return {
    title: `${title}. Archive anyway?`,
    body: `Archiving deletes them with the worktree.${kept}`,
  };
}

function counted(uncommitted: number): string {
  const files = uncommitted === 1 ? "1 file is" : `${uncommitted} files are`;
  return `${files} not committed`;
}

function capitalised(reason: string): string {
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}
