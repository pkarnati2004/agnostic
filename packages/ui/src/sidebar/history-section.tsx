import { ChevronRight } from "lucide-react";
import { cn } from "../class-names";
import type { SidebarRow } from "./group-tasks";
import { type CompareRowsProps, SidebarRows } from "./sidebar-rows";

type HistorySectionProps = CompareRowsProps & {
  repoId: string;
  /** Finished tasks whose worktree is gone, newest first; a compare once every sibling is one. */
  rows: SidebarRow[];
  selectedId: string | null;
  expanded: boolean;
  onToggle: (repoId: string) => void;
  onSelect: (id: string) => void;
};

/** A repo's past, folded away under its tasks: still here to open, no longer in the way. */
export function HistorySection(props: HistorySectionProps) {
  const { repoId, rows, selectedId, expanded, onToggle, onSelect } = props;
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => onToggle(repoId)}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left",
          "text-muted-foreground text-xs hover:bg-sidebar-accent",
          "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sidebar-ring",
        )}
      >
        <ChevronRight className={cn("size-3 shrink-0", expanded && "rotate-90")} />
        History ({rows.length})
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          <SidebarRows
            rows={rows}
            selectedId={selectedId}
            onSelect={onSelect}
            openCompares={props.openCompares}
            onToggleCompare={props.onToggleCompare}
            onOpenCompare={props.onOpenCompare}
          />
        </div>
      )}
    </div>
  );
}
