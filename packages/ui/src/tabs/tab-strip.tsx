import type { Task } from "@agnostic/core";
import { Columns4, Plus, X } from "lucide-react";
import { cn } from "../class-names";
import { Badge } from "../components/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { StatusGlyph } from "../status/status-glyph";
import type { NEW_TASK_TAB } from "./tabs-state";

/** What a tab stands for: a task's terminal, a compare's columns (ADR 036 Q7), or the composer. */
export type TabItem =
  | { kind: "task"; id: string; task: Task }
  | { kind: "compare"; id: string; title: string; agents: number }
  | { kind: "new"; id: typeof NEW_TASK_TAB };

type TabStripProps = {
  tabs: TabItem[];
  activeId: string | null;
  repoNames: ReadonlyMap<string, string>;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTask: () => void;
};

/**
 * The top edge is the whole state of a tab: the ring blue for the one in front, orange while a task
 * is waiting for an answer, whichever tab is in front. The close button is on the tab in front only,
 * so the strip holds still as the pointer crosses it.
 */
const EDGE = {
  active: "shadow-[inset_0_2px_0_var(--ring)]",
  waiting: "shadow-[inset_0_2px_0_var(--status-waiting)]",
  waitingInactive:
    "shadow-[inset_0_2px_0_color-mix(in_srgb,var(--status-waiting)_70%,transparent)]",
} as const;

/** One row of open tabs, in the order they were opened, and the "+" that starts another task. */
export function TabStrip({
  tabs,
  activeId,
  repoNames,
  onActivate,
  onClose,
  onNewTask,
}: TabStripProps) {
  return (
    <div
      role="tablist"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-sidebar-border border-b bg-sidebar"
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
          tooltip={tooltip(tab, repoNames)}
          onActivate={() => onActivate(tab.id)}
          onClose={() => onClose(tab.id)}
        />
      ))}
      <button
        type="button"
        aria-label="New task"
        onClick={onNewTask}
        className={cn(
          "flex shrink-0 items-center px-2.5 text-muted-foreground hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring",
        )}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

type TabProps = {
  tab: TabItem;
  active: boolean;
  tooltip: string;
  onActivate: () => void;
  onClose: () => void;
};

function Tab({ tab, active, tooltip, onActivate, onClose }: TabProps) {
  return (
    <Tooltip>
      <div
        data-tab={tab.id}
        data-active={active}
        data-status={tab.kind === "task" ? tab.task.status : undefined}
        className={cn(
          "flex min-w-0 max-w-[220px] items-center gap-2 border-sidebar-border border-r px-3",
          "type-meta",
          active ? "-mb-px bg-background text-foreground" : "text-muted-foreground",
          edge(tab, active),
        )}
      >
        <TooltipTrigger asChild>
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "flex min-w-0 items-center gap-2",
              "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring",
            )}
            onClick={onActivate}
          >
            <Mark tab={tab} />
            <span className="truncate">{title(tab)}</span>
            {tab.kind === "compare" && <Badge variant="count">{tab.agents}</Badge>}
          </button>
        </TooltipTrigger>
        {active && (
          <button
            type="button"
            aria-label={`Close ${title(tab)}`}
            className={cn(
              "shrink-0 rounded-sm text-muted-foreground hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring",
            )}
            onClick={onClose}
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** A waiting task keeps its edge whatever else is in front: it is the one thing a tab must say. */
function edge(tab: TabItem, active: boolean): string | false {
  if (tab.kind === "task" && tab.task.status === "waiting") {
    return active ? EDGE.waiting : EDGE.waitingInactive;
  }
  return active && EDGE.active;
}

/** The status dot for a terminal, the columns icon for a compare, the "+" for the composer. */
function Mark({ tab }: { tab: TabItem }) {
  if (tab.kind === "compare") {
    return <Columns4 className="size-3.5 shrink-0" />;
  }
  if (tab.kind === "new") {
    return <Plus className="size-3.5 shrink-0" />;
  }
  return <StatusGlyph status={tab.task.status} size="tab" />;
}

function title(tab: TabItem): string {
  switch (tab.kind) {
    case "task":
      return tab.task.title;
    case "compare":
      return tab.title;
    case "new":
      return "New task";
  }
}

function tooltip(tab: TabItem, repoNames: ReadonlyMap<string, string>): string {
  switch (tab.kind) {
    case "compare":
      return `${tab.title} · compare, ${tab.agents} agents`;
    case "new":
      return "New task";
    case "task":
      return `${tab.task.title} · ${repoNames.get(tab.task.repoId) ?? "unknown repo"}`;
  }
}
