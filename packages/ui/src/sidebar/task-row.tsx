import type { Task } from "@agnostic/core";
import { cn } from "../class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { STATUS_DOT } from "./status-dot";

export function TaskRow({
  task,
  repoName,
  selected,
  onSelect,
}: {
  task: Task;
  /** Named in Needs you, where rows from every repo sit together; null under a repo's heading. */
  repoName: string | null;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const dot = STATUS_DOT[task.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left",
        "hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-[2px]",
        "focus-visible:ring-sidebar-ring",
        selected && "bg-sidebar-accent",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: `var(${dot.token})` }}
            />
          </TooltipTrigger>
          <TooltipContent>{dot.label}</TooltipContent>
        </Tooltip>
        <span className="truncate text-sidebar-foreground text-sm">{task.title}</span>
      </span>
      <span className="flex min-w-0 gap-2 pl-4 text-muted-foreground text-xs">
        <span className="truncate">{whereItRuns(task, repoName)}</span>
        <span className="ml-auto shrink truncate">{task.profileId}</span>
      </span>
    </button>
  );
}

/** Two repos can hold a task with the same title and branch, so Needs you rows name the repo. */
function whereItRuns(task: Task, repoName: string | null): string {
  const branch = task.branch ?? "no branch";
  return repoName === null ? branch : `${repoName} · ${branch}`;
}
