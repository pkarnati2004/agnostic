import { PanelLeft, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../class-names";
import { IconAction } from "./icon-action";
import { paletteHint } from "./shortcut-hint";

type SidebarHeaderProps = {
  onNewTask: () => void;
  /** Opens the command palette, which is where searching happens. */
  onSearch: () => void;
  onToggle: () => void;
};

/**
 * The top of the sidebar: what this is, and the two things every session starts with. New task
 * carries no shortcut hint, because Cmd-N belongs to the browser (GAPS item 9a).
 */
export function SidebarHeader({ onNewTask, onSearch, onToggle }: SidebarHeaderProps) {
  return (
    <header className="flex shrink-0 flex-col">
      <div className="flex h-11 items-center justify-between pr-3 pl-4">
        <span className="font-mono font-semibold text-[13px] tracking-[-0.01em]">agnostic</span>
        <IconAction label="Hide the sidebar" tooltip="Hide the sidebar" onClick={onToggle}>
          <PanelLeft />
        </IconAction>
      </div>
      <div className="flex flex-col gap-0.5 px-2">
        <HeaderRow label="New task" onClick={onNewTask} className="bg-muted text-foreground">
          <Plus className="size-3.5 shrink-0" />
        </HeaderRow>
        <HeaderRow label="Search" onClick={onSearch} hint={paletteHint(navigator.platform)}>
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
        </HeaderRow>
      </div>
    </header>
  );
}

type HeaderRowProps = {
  label: string;
  hint?: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
};

function HeaderRow({ label, hint, className, onClick, children }: HeaderRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[30px] items-center gap-2 rounded-[7px] px-2 text-left text-[13px]",
        "text-sidebar-foreground hover:bg-sidebar-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
    >
      {children}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint !== undefined && (
        <kbd className="rounded border border-border px-[5px] py-px font-mono text-[10.5px] text-muted-foreground">
          {hint}
        </kbd>
      )}
    </button>
  );
}
