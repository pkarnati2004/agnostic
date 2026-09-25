import type { RepoListRow } from "@agnostic/core";
import { FolderPlus, Plus } from "lucide-react";
import { useState } from "react";
import type { RepoNotices } from "../repo/repo-notices";
import { ClosedSection } from "./closed-section";
import { DaemonFooter, type DaemonState } from "./daemon-footer";
import { closedRepos, type SidebarGroups } from "./group-tasks";
import { IconAction } from "./icon-action";
import { NeedsYou } from "./needs-you";
import { Rail } from "./rail";
import { RepoSection } from "./repo-section";
import { SectionHeading } from "./section";
import { SidebarHeader } from "./sidebar-header";

type SidebarProps = {
  groups: SidebarGroups;
  /** Every repo the daemon knows, the closed ones included: only the Closed section draws those. */
  repos: RepoListRow[];
  selectedId: string | null;
  collapsed: boolean;
  /** Whether agnd is answering, and which version: the footer and the rail's dot. */
  daemon: DaemonState;
  /** The page's 30 s tick, which is what keeps the Needs you times honest. */
  now: number;
  onSelect: (id: string) => void;
  /** Opens the group's Compare view in the centre, which is a tab of its own (ADR 036 Q7). */
  onOpenCompare: (compareId: string) => void;
  onNewTask: () => void;
  /** Opens the command palette: searching and running a command are the same box. */
  onSearch: () => void;
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
      <Rail
        groups={groups}
        daemon={props.daemon}
        onToggle={props.onToggle}
        onNewTask={props.onNewTask}
        onSearch={props.onSearch}
        onSelect={onSelect}
      />
    );
  }
  const repoNames = new Map(groups.repos.map((group) => [group.repo.id, group.repo.name]));
  return (
    <aside className="flex min-h-0 flex-col border-sidebar-border border-r bg-sidebar">
      <SidebarHeader
        onNewTask={props.onNewTask}
        onSearch={props.onSearch}
        onToggle={props.onToggle}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <NeedsYou
          tasks={groups.needsYou}
          repoNames={repoNames}
          selectedId={selectedId}
          now={props.now}
          onSelect={onSelect}
        />
        {/* No heading with nothing under it: the centre is what offers the first repo. */}
        {groups.repos.length > 0 && (
          <div className="px-2 pt-4">
            <SectionHeading
              title="Repos"
              actions={
                <>
                  <IconAction
                    label="New task"
                    tooltip="New task"
                    onClick={props.onNewTask}
                    className="size-6"
                  >
                    <Plus />
                  </IconAction>
                  <IconAction
                    label="Add a repo"
                    tooltip="Add a repo"
                    onClick={props.onAddRepo}
                    className="size-6"
                  >
                    <FolderPlus />
                  </IconAction>
                </>
              }
            />
          </div>
        )}
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
      <DaemonFooter {...props.daemon} />
    </aside>
  );
}

function toggled(open: ReadonlySet<string>, repoId: string): ReadonlySet<string> {
  const next = new Set(open);
  if (!next.delete(repoId)) {
    next.add(repoId);
  }
  return next;
}
