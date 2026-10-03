import type { RepoListRow } from "@agnostic/core";
import { useState } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { RepoNoticeLine } from "../repo/repo-notice-line";
import type { RepoNotices } from "../repo/repo-notices";
import { CollapsedRow } from "./collapsed-row";
import { removeTooltip } from "./remove-tooltip";

type ClosedSectionProps = {
  /** The closed repos, by name; nothing else in the sidebar draws them. */
  repos: RepoListRow[];
  expanded: boolean;
  onToggle: () => void;
  onReopen: (repoId: string) => Promise<void>;
  /** Opens the confirmation; nothing is removed until the dialog is answered. */
  onRemove: (repoId: string) => void;
  notices: RepoNotices;
};

/** The repos folded away at the foot of the sidebar, each one click from being back in the list. */
export function ClosedSection({
  repos,
  expanded,
  onToggle,
  onReopen,
  onRemove,
  notices,
}: ClosedSectionProps) {
  if (repos.length === 0) {
    return null;
  }
  return (
    <section className="px-2 pt-3">
      <CollapsedRow label="Closed" count={repos.length} expanded={expanded} onToggle={onToggle}>
        <p className="px-2 py-1 text-muted-foreground type-meta">
          A closed repo is hidden here. Its usage and outcome history is kept.
        </p>
        {repos.map((repo) => (
          <ClosedRepo
            key={repo.id}
            repo={repo}
            notice={notices[repo.id] ?? null}
            onReopen={onReopen}
            onRemove={onRemove}
          />
        ))}
      </CollapsedRow>
    </section>
  );
}

type ClosedRepoProps = {
  repo: RepoListRow;
  notice: RepoNotices[string] | null;
  onReopen: (repoId: string) => Promise<void>;
  onRemove: (repoId: string) => void;
};

function ClosedRepo({ repo, notice, onReopen, onRemove }: ClosedRepoProps) {
  const [busy, setBusy] = useState(false);
  // A refused reopen is already on its way to the notice below, so nothing is done with it here.
  const reopen = () => {
    setBusy(true);
    void onReopen(repo.id)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sidebar-foreground text-[13px]">{repo.name}</p>
          <p className="truncate text-muted-foreground text-[11px]" title={repo.path}>
            {repo.pathPresent ? repo.path : `${repo.path} (not found)`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={reopen} disabled={busy}>
          Reopen
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => onRemove(repo.id)}>
              Remove
            </Button>
          </TooltipTrigger>
          <TooltipContent>{removeTooltip(repo.name)}</TooltipContent>
        </Tooltip>
      </div>
      {notice !== null && <RepoNoticeLine notice={notice} repo={repo} />}
    </div>
  );
}
