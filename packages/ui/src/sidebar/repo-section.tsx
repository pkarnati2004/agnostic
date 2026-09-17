import type { RepoListRow } from "@agnostic/core";
import { Archive } from "lucide-react";
import { useState } from "react";
import { RepoNoticeLine } from "../repo/repo-notice-line";
import type { RepoNotice } from "../repo/repo-notices";
import type { RepoGroup } from "./group-tasks";
import { HistorySection } from "./history-section";
import { IconAction } from "./icon-action";
import { Section } from "./section";
import { TaskRow } from "./task-row";

type RepoSectionProps = {
  group: RepoGroup;
  selectedId: string | null;
  expanded: boolean;
  /** What the last close of this repo answered, drawn under its heading. */
  notice: RepoNotice | null;
  onToggle: (repoId: string) => void;
  onSelect: (id: string) => void;
  onClose: (repoId: string) => Promise<void>;
};

/** One repo: its live tasks, then whatever it has already finished and cleaned up after. */
export function RepoSection({ group, selectedId, expanded, notice, ...on }: RepoSectionProps) {
  const empty = group.tasks.length === 0 && group.history.length === 0;
  // A section nobody opened still shows its rows while the task in front is one of them.
  const showing = expanded || group.history.some((task) => task.id === selectedId);
  return (
    <Section
      title={group.repo.name}
      action={<CloseButton repo={group.repo} onClose={on.onClose} />}
    >
      {notice !== null && <RepoNoticeLine notice={notice} repo={group.repo} />}
      {empty && <p className="px-2 py-1.5 text-muted-foreground text-xs">No tasks yet.</p>}
      {group.tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          repoName={null}
          selected={task.id === selectedId}
          onSelect={on.onSelect}
        />
      ))}
      <HistorySection
        repoId={group.repo.id}
        tasks={group.history}
        selectedId={selectedId}
        expanded={showing}
        onToggle={on.onToggle}
        onSelect={on.onSelect}
      />
    </Section>
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
