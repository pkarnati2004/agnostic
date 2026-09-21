import type { RepoListRow } from "@agnostic/core";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "../class-names";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { RepoNoticeLine } from "../repo/repo-notice-line";
import type { RepoNotices } from "../repo/repo-notices";
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
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left",
          "text-muted-foreground text-xs hover:bg-sidebar-accent",
          "focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-sidebar-ring",
        )}
      >
        <ChevronRight className={cn("size-3 shrink-0", expanded && "rotate-90")} />
        Closed ({repos.length})
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          <p className="px-2 py-1 text-muted-foreground text-xs">
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
        </div>
      )}
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
          <p className="truncate text-sidebar-foreground text-sm">{repo.name}</p>
          <p className="truncate text-muted-foreground text-xs" title={repo.path}>
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
