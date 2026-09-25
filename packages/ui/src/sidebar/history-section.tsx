import type { RepoListRow } from "@agnostic/core";
import { CollapsedRow } from "./collapsed-row";
import type { SidebarRow } from "./group-tasks";
import { type CompareRowsProps, SidebarRows } from "./sidebar-rows";

type HistorySectionProps = CompareRowsProps & {
  repoId: string;
  repo: Pick<RepoListRow, "testCommand">;
  /** Finished tasks whose worktree is gone, newest first; a compare once every sibling is one. */
  rows: SidebarRow[];
  selectedId: string | null;
  expanded: boolean;
  onToggle: (repoId: string) => void;
  onSelect: (id: string) => void;
};

/** A repo's past, folded away under its tasks: still here to open, no longer in the way. */
export function HistorySection(props: HistorySectionProps) {
  const { repoId, repo, rows, selectedId, expanded, onToggle, onSelect } = props;
  if (rows.length === 0) {
    return null;
  }
  return (
    <CollapsedRow
      label="History"
      count={rows.length}
      expanded={expanded}
      onToggle={() => onToggle(repoId)}
    >
      <SidebarRows
        rows={rows}
        repo={repo}
        selectedId={selectedId}
        onSelect={onSelect}
        openCompares={props.openCompares}
        onToggleCompare={props.onToggleCompare}
        onOpenCompare={props.onOpenCompare}
      />
    </CollapsedRow>
  );
}
