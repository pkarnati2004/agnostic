import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../class-names";

/**
 * The collapsed rows at the foot of a repo and of the sidebar: chevron, word, count at the right.
 * History and Closed are the parts of the page that are not asking to be read, so they read quietly
 * and take one click to open.
 */
export function CollapsedRow({
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex h-7 w-full items-center gap-2 rounded-[7px] px-2 text-left",
          "text-muted-foreground text-[13px] hover:bg-sidebar-accent",
          "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sidebar-ring",
        )}
      >
        <ChevronRight className={cn("size-3 shrink-0", expanded && "rotate-90")} />
        <span className="flex-1">{label}</span>
        <span className="text-[11px]">{count}</span>
      </button>
      {expanded && <div className="flex flex-col gap-0.5 pt-0.5">{children}</div>}
    </div>
  );
}
