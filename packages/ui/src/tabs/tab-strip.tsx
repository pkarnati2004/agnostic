import type { Task } from "@agnostic/core";
import { X } from "lucide-react";
import { cn } from "../class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { STATUS_DOT } from "../sidebar/status-dot";

// A tab is a place to click, not a place to read: the tooltip carries the whole title.
const TITLE_CHARS = 24;

type TabStripProps = {
  tabs: Task[];
  activeId: string | null;
  repoNames: ReadonlyMap<string, string>;
  onActivate: (taskId: string) => void;
  onClose: (taskId: string) => void;
};

/** One row of open terminals, in the order they were opened. */
export function TabStrip({ tabs, activeId, repoNames, onActivate, onClose }: TabStripProps) {
  if (tabs.length === 0) {
    return null;
  }
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-border border-b px-2 pt-2">
      {tabs.map((task) => (
        <Tooltip key={task.id}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-t-md border border-border border-b-0",
                "px-3 py-1.5 text-sm",
                task.id === activeId ? "bg-card" : "bg-transparent text-muted-foreground",
              )}
            >
              <button
                type="button"
                className="flex items-center gap-2 outline-none"
                onClick={() => onActivate(task.id)}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: `var(${STATUS_DOT[task.status].token})` }}
                />
                {shortTitle(task.title)}
              </button>
              <button
                type="button"
                aria-label={`Close ${task.title}`}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => onClose(task.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent>{`${task.title} · ${repoNames.get(task.repoId) ?? "unknown repo"}`}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function shortTitle(title: string): string {
  return title.length <= TITLE_CHARS ? title : `${title.slice(0, TITLE_CHARS - 1)}…`;
}
