import type { TaskStatus } from "@agnostic/core";
import { PanelLeft, Plus, Search } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../class-names";
import type { DaemonState } from "./daemon-footer";
import type { RepoGroup, SidebarGroups } from "./group-tasks";
import { IconAction } from "./icon-action";
import { repoBadge, repoTasks } from "./rail-badges";

type RailProps = {
  groups: SidebarGroups;
  daemon: DaemonState;
  onToggle: () => void;
  onNewTask: () => void;
  onSearch: () => void;
  onSelect: (taskId: string) => void;
};

/**
 * The sidebar at 52 px, which is what a 13-inch screen gets (TESTING v1 item 7). It keeps the two
 * things the header offers, says which repos want a look, and shows the daemon's dot; the rest of
 * the sidebar is one click away, and a repo's square is that click.
 */
export function Rail({ groups, daemon, onToggle, onNewTask, onSearch, onSelect }: RailProps) {
  const waiting = groups.needsYou;
  const oldest = waiting[0];
  return (
    <nav className="flex flex-col items-center gap-1.5 border-sidebar-border border-r bg-sidebar pt-3">
      <div className="mb-2">
        <IconAction label="Show the sidebar" tooltip="Show the sidebar" onClick={onToggle}>
          <PanelLeft />
        </IconAction>
      </div>
      <Square label="New task" onClick={onNewTask} className="bg-muted">
        <Plus className="size-3.5" />
      </Square>
      <Square label="Search" onClick={onSearch}>
        <Search className="size-3.5 text-muted-foreground" />
      </Square>
      <span aria-hidden className="my-1.5 h-px w-6 bg-sidebar-border" />
      {oldest !== undefined && (
        <Square
          label={`${waiting.length} waiting for you`}
          onClick={() => onSelect(oldest.id)}
          className="font-semibold text-[12px]"
          style={{
            backgroundColor: "color-mix(in srgb, var(--status-waiting) 14%, transparent)",
            color: "var(--status-waiting)",
          }}
        >
          {waiting.length}
        </Square>
      )}
      {groups.repos.map((group) => (
        <RepoSquare key={group.repo.id} group={group} onToggle={onToggle} />
      ))}
      <span className="flex-1" />
      <span
        aria-hidden
        className="mb-4 size-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor:
            daemon.connection === "live" ? "var(--status-running)" : "var(--status-failed)",
        }}
      />
    </nav>
  );
}

/** A repo's initial, with a dot for the worst thing happening in it. Clicking opens the sidebar. */
function RepoSquare({ group, onToggle }: { group: RepoGroup; onToggle: () => void }) {
  const badge = repoBadge(repoTasks(group));
  return (
    <Square
      label={group.repo.name}
      onClick={onToggle}
      className="mt-1.5 font-semibold text-[12px] text-sidebar-foreground"
      badge={badge}
    >
      {group.repo.name.slice(0, 1).toLowerCase()}
    </Square>
  );
}

type SquareProps = {
  label: string;
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
  /** The status the square reports, drawn as an 8 px dot over its top right corner. */
  badge?: TaskStatus | null;
  children: ReactNode;
};

function Square({ label, onClick, className, style, badge, children }: SquareProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-badge={badge ?? undefined}
      onClick={onClick}
      style={style}
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-lg",
        "hover:bg-sidebar-accent focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
    >
      {children}
      {badge != null && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-sidebar"
          style={{ backgroundColor: `var(--status-${badge})` }}
        />
      )}
    </button>
  );
}
