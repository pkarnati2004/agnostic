import { ChevronRight, GitCompare } from "lucide-react";
import { cn } from "../class-names";
import { compareSummary } from "../compare/compare-lines";
import { compareTabId } from "../tabs/tabs-state";
import type { CompareGroup } from "./group-tasks";
import { TaskRow } from "./task-row";

type CompareRowProps = {
  group: CompareGroup;
  selectedId: string | null;
  expanded: boolean;
  onToggle: (compareId: string) => void;
  onOpenCompare: (compareId: string) => void;
  onSelect: (taskId: string) => void;
};

/**
 * The agents of one compare as a single row: the title opens the Compare view, and the chevron
 * lists the siblings under it, each one a task row of its own.
 */
export function CompareRow({ group, selectedId, expanded, ...on }: CompareRowProps) {
  const summary = compareSummary(group);
  const selected = selectedId === compareTabId(group.compareId);
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          "flex min-w-0 items-center gap-1 rounded-md pr-2 hover:bg-sidebar-accent",
          selected && "bg-sidebar-accent",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} the agents of ${group.title}`}
          onClick={() => on.onToggle(group.compareId)}
          className={cn(
            "shrink-0 rounded-md px-1 py-1.5 text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sidebar-ring",
          )}
        >
          <ChevronRight className={cn("size-3 shrink-0", expanded && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={() => on.onOpenCompare(group.compareId)}
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0.5 rounded-md py-1.5 text-left",
            "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sidebar-ring",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <GitCompare className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate text-sidebar-foreground text-sm">{group.title}</span>
          </span>
          <span className="truncate pl-5 text-muted-foreground text-xs">
            {`compare · ${group.tasks.length} agents · ${summary}`}
          </span>
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col gap-0.5 pl-3">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              repoName={null}
              selected={task.id === selectedId}
              onSelect={on.onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
