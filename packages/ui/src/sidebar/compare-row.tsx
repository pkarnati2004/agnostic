import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { ChevronRight } from "lucide-react";
import { cn } from "../class-names";
import { compareSummary } from "../compare/compare-lines";
import { Badge } from "../components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { STATUS_DOT } from "../status/status-dot";
import { compareTabId } from "../tabs/tabs-state";
import type { CompareGroup } from "./group-tasks";
import { TaskRow } from "./task-row";

/** Four dots is what an 8 px square holds, and four agents is what `agn compare` takes. */
const CLUSTER = 4;

type CompareRowProps = {
  group: CompareGroup;
  /** The repo the siblings run in, for what a queued one is waiting on. */
  repo: Pick<RepoListRow, "testCommand"> | null;
  selectedId: string | null;
  expanded: boolean;
  onToggle: (compareId: string) => void;
  onOpenCompare: (compareId: string) => void;
  onSelect: (taskId: string) => void;
};

/**
 * The agents of one compare as a single row: the title opens the Compare view, and the chevron
 * lists the siblings under it, each one a task row of its own. A dot per agent says what they are
 * doing, which is what the row used to spell out; the words are in the tooltip.
 */
export function CompareRow({ group, repo, selectedId, expanded, ...on }: CompareRowProps) {
  const selected = selectedId === compareTabId(group.compareId);
  return (
    <div className="flex flex-col gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex min-w-0 items-center gap-1 rounded-[7px] pr-2 hover:bg-sidebar-accent",
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
                "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-left",
                "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sidebar-ring",
              )}
            >
              <Cluster tasks={group.tasks} />
              <span className="min-w-0 flex-1 truncate text-sidebar-foreground text-[13px]">
                {group.title}
              </span>
              <Badge variant="count">{group.tasks.length}</Badge>
            </button>
          </div>
        </TooltipTrigger>
        <TooltipContent>{`compare · ${group.tasks.length} agents · ${compareSummary(group)}`}</TooltipContent>
      </Tooltip>
      {expanded && (
        <div className="flex flex-col gap-0.5 pl-3">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              repo={repo}
              selected={task.id === selectedId}
              onSelect={on.onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** One 3 px dot per agent in its status colour, in the space a single glyph takes. */
function Cluster({ tasks }: { tasks: TaskListRow[] }) {
  return (
    <span aria-hidden className="flex w-2 shrink-0 flex-wrap gap-[2px]">
      {tasks.slice(0, CLUSTER).map((task) => (
        <span
          key={task.id}
          className="size-[3px] rounded-full"
          style={{ backgroundColor: `var(${STATUS_DOT[task.status].token})` }}
        />
      ))}
    </span>
  );
}
