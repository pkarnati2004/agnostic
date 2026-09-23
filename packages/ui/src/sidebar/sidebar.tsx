import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { FolderPlus, PanelLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/button";
import type { RepoNotices } from "../repo/repo-notices";
import { ClosedSection } from "./closed-section";
import { closedRepos, type SidebarGroups } from "./group-tasks";
import { IconAction } from "./icon-action";
import { RepoSection } from "./repo-section";
import { Section } from "./section";
import { TaskRow } from "./task-row";

type SidebarProps = {
  groups: SidebarGroups;
  /** Every repo the daemon knows, the closed ones included: only the Closed section draws those. */
  repos: RepoListRow[];
  selectedId: string | null;
  collapsed: boolean;
  onSelect: (id: string) => void;
  /** Opens the group's Compare view in the centre, which is a tab of its own (ADR 036 Q7). */
  onOpenCompare: (compareId: string) => void;
  onNewTask: () => void;
  onAddRepo: () => void;
  /** Rejects when the daemon refused; by then the failure is already in `repoNotices`. */
  onCloseRepo: (repoId: string) => Promise<void>;
  onReopenRepo: (repoId: string) => Promise<void>;
  /** Asks the page for the confirmation: the sidebar never removes a repo itself. */
  onRemoveRepo: (repoId: string) => void;
  repoNotices: RepoNotices;
  onToggle: () => void;
};

/** Every repo and task the daemon knows, with the ones waiting for an answer at the top. */
export function Sidebar(props: SidebarProps) {
  const { groups, selectedId, onSelect } = props;
  // Collapsed on every load: History and Closed are the parts the page is not asking you to read.
  const [openHistory, setOpenHistory] = useState<ReadonlySet<string>>(new Set());
  // Only the compares the user has opened or closed by hand; the rest follow what they are doing.
  const [openCompares, setOpenCompares] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [openClosed, setOpenClosed] = useState(false);
  if (props.collapsed) {
    return (
      <aside className="flex flex-col items-center border-sidebar-border border-r bg-sidebar py-3">
        <CollapseButton collapsed onToggle={props.onToggle} />
      </aside>
    );
  }
  return (
    <aside className="flex min-h-0 flex-col border-sidebar-border border-r bg-sidebar">
      <header className="flex items-center gap-2 px-3 py-3">
        <span className="font-semibold text-sidebar-foreground text-sm">agn</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={props.onNewTask}>
            <Plus />
            Task
          </Button>
          <IconAction label="Add a repo" tooltip="Add a repo" onClick={props.onAddRepo}>
            <FolderPlus />
          </IconAction>
          <CollapseButton collapsed={false} onToggle={props.onToggle} />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <NeedsYou groups={groups} selectedId={selectedId} onSelect={onSelect} />
        {groups.repos.map((group) => (
          <RepoSection
            key={group.repo.id}
            group={group}
            selectedId={selectedId}
            expanded={openHistory.has(group.repo.id)}
            notice={props.repoNotices[group.repo.id] ?? null}
            onToggle={(repoId) => setOpenHistory(toggled(openHistory, repoId))}
            onSelect={onSelect}
            openCompares={openCompares}
            onToggleCompare={(compareId, expanded) =>
              setOpenCompares(new Map(openCompares).set(compareId, expanded))
            }
            onOpenCompare={props.onOpenCompare}
            onClose={props.onCloseRepo}
            onRemove={props.onRemoveRepo}
          />
        ))}
        <ClosedSection
          repos={closedRepos(props.repos)}
          expanded={openClosed}
          onToggle={() => setOpenClosed(!openClosed)}
          onReopen={props.onReopenRepo}
          onRemove={props.onRemoveRepo}
          notices={props.repoNotices}
        />
      </div>
    </aside>
  );
}

type NeedsYouProps = {
  groups: SidebarGroups;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/** The tasks asking a question, oldest first, each one named by the repo it is in. */
function NeedsYou({ groups, selectedId, onSelect }: NeedsYouProps) {
  if (groups.needsYou.length === 0) {
    return null;
  }
  const repoNames = new Map(groups.repos.map((group) => [group.repo.id, group.repo.name]));
  return (
    <Section title="Needs you">
      {groups.needsYou.map((task: TaskListRow) => (
        <TaskRow
          key={task.id}
          task={task}
          repoName={repoNames.get(task.repoId) ?? null}
          selected={task.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </Section>
  );
}

function CollapseButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Show the sidebar" : "Hide the sidebar";
  return (
    <IconAction label={label} tooltip={label} onClick={onToggle}>
      <PanelLeft />
    </IconAction>
  );
}

function toggled(open: ReadonlySet<string>, repoId: string): ReadonlySet<string> {
  const next = new Set(open);
  if (!next.delete(repoId)) {
    next.add(repoId);
  }
  return next;
}
