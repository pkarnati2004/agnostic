import type { Repo } from "@agnostic/core";
import { type RepoNotice, repoNoticeLine } from "./repo-notices";

/** What the daemon said about one repo, under the row that asked. It clears itself. */
export function RepoNoticeLine({ notice, repo }: { notice: RepoNotice; repo: Pick<Repo, "name"> }) {
  return (
    <div role="alert" className="min-w-0 px-2 py-1">
      <p className="text-destructive text-xs">{repoNoticeLine(notice, repo)}</p>
      {notice.error.hint !== null && (
        <p className="mt-0.5 text-muted-foreground text-xs">{notice.error.hint}</p>
      )}
    </div>
  );
}
