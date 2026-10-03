import type { Repo } from "@agnostic/core";
import { HintText } from "../hint-text";
import { NoticeLine } from "../notice/notice-line";
import { type RepoNotice, repoNoticeLine } from "./repo-notices";

/** What the daemon said about one repo, under the row that asked. It clears itself. */
export function RepoNoticeLine({ notice, repo }: { notice: RepoNotice; repo: Pick<Repo, "name"> }) {
  return (
    <NoticeLine tone="error" className="border-b-0 px-2 py-1">
      {repoNoticeLine(notice, repo)}
      {notice.error.hint !== null && (
        <span className="mt-0.5 block text-muted-foreground">
          <HintText hint={notice.error.hint} />
        </span>
      )}
    </NoticeLine>
  );
}
