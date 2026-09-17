import type { Task } from "@agnostic/core";
import { ChevronRight } from "lucide-react";
import { cn } from "../class-names";
import { TaskRow } from "./task-row";

type HistorySectionProps = {
  repoId: string;
  /** Finished tasks whose worktree is gone, newest first. */
  tasks: Task[];
  selectedId: string | null;
  expanded: boolean;
  onToggle: (repoId: string) => void;
  onSelect: (id: string) => void;
};

/** A repo's past, folded away under its tasks: still here to open, no longer in the way. */
export function HistorySection(props: HistorySectionProps) {
  const { repoId, tasks, selectedId, expanded, onToggle, onSelect } = props;
  if (tasks.length === 0) {
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
        History ({tasks.length})
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              repoName={null}
              selected={task.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
