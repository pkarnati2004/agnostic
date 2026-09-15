import { PanelLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import type { SidebarGroups } from "./group-tasks";
import { TaskRow } from "./task-row";

type SidebarProps = {
  groups: SidebarGroups;
  selectedId: string | null;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onNewTask: () => void;
  onToggle: () => void;
};

/** Every repo and task the daemon knows, with the ones waiting for an answer at the top. */
export function Sidebar({
  groups,
  selectedId,
  collapsed,
  onSelect,
  onNewTask,
  onToggle,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside className="flex flex-col items-center border-sidebar-border border-r bg-sidebar py-3">
        <CollapseButton collapsed onToggle={onToggle} />
      </aside>
    );
  }
  const repoNames = new Map(groups.repos.map((group) => [group.repo.id, group.repo.name]));
  return (
    <aside className="flex min-h-0 flex-col border-sidebar-border border-r bg-sidebar">
      <header className="flex items-center gap-2 px-3 py-3">
        <span className="font-semibold text-sidebar-foreground text-sm">agn</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={onNewTask}>
            <Plus />
            Task
          </Button>
          <CollapseButton collapsed={false} onToggle={onToggle} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {groups.needsYou.length > 0 && (
          <Section title="Needs you">
            {groups.needsYou.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                repoName={repoNames.get(task.repoId) ?? null}
                selected={task.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </Section>
        )}
        {groups.repos.map((group) => (
          <Section key={group.repo.id} title={group.repo.name}>
            {group.tasks.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground text-xs">No tasks yet.</p>
            ) : (
              group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  repoName={null}
                  selected={task.id === selectedId}
                  onSelect={onSelect}
                />
              ))
            )}
          </Section>
        ))}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-2 pt-3">
      <h2 className="px-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h2>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function CollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Show the sidebar" : "Hide the sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label={label}>
          <PanelLeft />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
