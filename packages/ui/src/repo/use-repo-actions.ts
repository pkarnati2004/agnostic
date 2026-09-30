import { useCallback } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";
import { useNotices } from "../store/notice-store";
import type { RepoAction, RepoNotice, RepoNotices } from "./repo-notices";

export type RepoActions = {
  /** The latest failure per repo, drawn under the row it was asked from. */
  notices: RepoNotices;
  close(repoId: string): Promise<void>;
  reopen(repoId: string): Promise<void>;
  /** The repo leaves every list for good; its rows, and so its history, stay (ADR 034). */
  remove(repoId: string): Promise<void>;
  /** Writes the repo's generated files. Nothing is said when they were already current. */
  sync(repoId: string): Promise<void>;
};

/**
 * Close, reopen, remove and sync, with the answer kept per repo. No call writes to the store: the
 * `repo.updated` it makes arrives through the feed, which is how the sidebar moves the row. Each
 * rejects after recording the failure, so a caller with somewhere better to show it still can.
 */
export function useRepoActions(client: WorkspaceClient): RepoActions {
  const { notices, failed, cleared } = useNotices<Omit<RepoNotice, "at">>();
  const act = useCallback(
    async (repoId: string, action: RepoAction, run: () => Promise<unknown>) => {
      try {
        await run();
        cleared(repoId);
      } catch (cause) {
        failed(repoId, { action, error: asApiError(cause) });
        throw cause;
      }
    },
    [cleared, failed],
  );
  return {
    notices,
    close: useCallback(
      (repoId: string) => act(repoId, "close", () => client.closeRepo(repoId)),
      [act, client],
    ),
    reopen: useCallback(
      (repoId: string) => act(repoId, "reopen", () => client.openRepo(repoId)),
      [act, client],
    ),
    remove: useCallback(
      (repoId: string) => act(repoId, "remove", () => client.removeRepo(repoId)),
      [act, client],
    ),
    sync: useCallback(
      (repoId: string) => act(repoId, "sync", () => client.syncRepo(repoId, {})),
      [act, client],
    ),
  };
}
