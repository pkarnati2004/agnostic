import type { Task } from "@agnostic/core";
import { GitCompare, X } from "lucide-react";
import { cn } from "../class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { StatusGlyph } from "../status/status-glyph";

// A tab is a place to click, not a place to read: the tooltip carries the whole title.
const TITLE_CHARS = 24;

/** What a tab stands for: one task's terminal, or one compare's columns (ADR 036 Q7). */
export type TabItem =
  | { kind: "task"; id: string; task: Task }
  | { kind: "compare"; id: string; title: string; agents: number };

type TabStripProps = {
  tabs: TabItem[];
  activeId: string | null;
  repoNames: ReadonlyMap<string, string>;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
};

/** One row of open tabs, in the order they were opened. */
export function TabStrip({ tabs, activeId, repoNames, onActivate, onClose }: TabStripProps) {
  if (tabs.length === 0) {
    return null;
  }
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-border border-b px-2 pt-2">
      {tabs.map((tab) => (
        <Tooltip key={tab.id}>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-t-md border border-border border-b-0",
                "px-3 py-1.5 text-sm",
                tab.id === activeId ? "bg-card" : "bg-transparent text-muted-foreground",
              )}
            >
              <button
                type="button"
                className="flex items-center gap-2 outline-none"
                onClick={() => onActivate(tab.id)}
              >
                <Mark tab={tab} />
                {shortTitle(title(tab))}
              </button>
              <button
                type="button"
                aria-label={`Close ${title(tab)}`}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => onClose(tab.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </TooltipTrigger>
          <TooltipContent>{tooltip(tab, repoNames)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/** The status dot for a terminal, the compare icon for the view over a group of them. */
function Mark({ tab }: { tab: TabItem }) {
  if (tab.kind === "compare") {
    return <GitCompare className="size-3 shrink-0" />;
  }
  return <StatusGlyph status={tab.task.status} size="tab" />;
}

function title(tab: TabItem): string {
  return tab.kind === "task" ? tab.task.title : tab.title;
}

function tooltip(tab: TabItem, repoNames: ReadonlyMap<string, string>): string {
  if (tab.kind === "compare") {
    return `${tab.title} · compare, ${tab.agents} agents`;
  }
  return `${tab.task.title} · ${repoNames.get(tab.task.repoId) ?? "unknown repo"}`;
}

function shortTitle(text: string): string {
  return text.length <= TITLE_CHARS ? text : `${text.slice(0, TITLE_CHARS - 1)}…`;
}
