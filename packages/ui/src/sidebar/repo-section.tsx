import type { RepoListRow } from "@agnostic/core";
import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import { RepoNoticeLine } from "../repo/repo-notice-line";
import type { RepoNotice } from "../repo/repo-notices";
import { compareTabId } from "../tabs/tabs-state";
import type { RepoGroup, SidebarRow } from "./group-tasks";
import { HistorySection } from "./history-section";
import { IconAction } from "./icon-action";
import { removeTooltip } from "./remove-tooltip";
import { Section } from "./section";
import { type CompareRowsProps, SidebarRows } from "./sidebar-rows";

type RepoSectionProps = CompareRowsProps & {
  group: RepoGroup;
  selectedId: string | null;
  expanded: boolean;
  /** What the last close of this repo answered, drawn under its heading. */
  notice: RepoNotice | null;
  onToggle: (repoId: string) => void;
  onSelect: (id: string) => void;
  onClose: (repoId: string) => Promise<void>;
  /** Opens the confirmation; nothing is removed until the dialog is answered. */
  onRemove: (repoId: string) => void;
};

/** One repo: its live tasks, then whatever it has already finished and cleaned up after. */
export function RepoSection({ group, selectedId, expanded, notice, ...on }: RepoSectionProps) {
  const repo = group.repo;
  const empty = group.rows.length === 0 && group.history.length === 0;
  // A section nobody opened still shows its rows while the task in front is one of them.
  const showing = expanded || group.history.some((row) => holds(row, selectedId));
  return (
    <Section
      title={repo.name}
      action={
        <>
          {/* Remove sits on the heading only while the folder is gone: there is nothing to close. */}
          {!repo.pathPresent && (
            <IconAction
              label={`Remove ${repo.name}`}
              tooltip={removeTooltip(repo.name)}
              onClick={() => on.onRemove(repo.id)}
              className="size-6"
            >
              <Trash2 />
            </IconAction>
          )}
          <CloseButton repo={repo} onClose={on.onClose} />
        </>
      }
    >
      {!repo.pathPresent && (
        <p className="truncate px-2 text-muted-foreground text-xs" title={repo.path}>
          Not found: {repo.path}
        </p>
      )}
      {notice !== null && <RepoNoticeLine notice={notice} repo={repo} />}
      {empty && <p className="px-2 py-1.5 text-muted-foreground text-xs">No tasks yet.</p>}
      <SidebarRows
        rows={group.rows}
        selectedId={selectedId}
        onSelect={on.onSelect}
        openCompares={on.openCompares}
        onToggleCompare={on.onToggleCompare}
        onOpenCompare={on.onOpenCompare}
      />
      <HistorySection
        repoId={repo.id}
        rows={group.history}
        selectedId={selectedId}
        expanded={showing}
        onToggle={on.onToggle}
        onSelect={on.onSelect}
        openCompares={on.openCompares}
        onToggleCompare={on.onToggleCompare}
        onOpenCompare={on.onOpenCompare}
      />
    </Section>
  );
}

/** Whether a row is the one in front: a compare row answers for its siblings as well as itself. */
function holds(row: SidebarRow, selectedId: string | null): boolean {
  if (row.kind === "task") {
    return row.task.id === selectedId;
  }
  return (
    selectedId === compareTabId(row.group.compareId) ||
    row.group.tasks.some((task) => task.id === selectedId)
  );
}

/** Closing hides the repo and its tasks; the Closed section at the foot holds it until it is back. */
function CloseButton({
  repo,
  onClose,
}: {
  repo: RepoListRow;
  onClose: (repoId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  // A refusal is already on its way to the notice under the heading, so nothing is done with it.
  const close = () => {
    setBusy(true);
    void onClose(repo.id)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <IconAction
      label={`Close ${repo.name}`}
      tooltip={`Close ${repo.name}. It stops showing here; its history is kept.`}
      onClick={close}
      disabled={busy}
      className="size-6"
    >
      <Archive />
    </IconAction>
  );
}
