import type { Repo } from "@agnostic/core";
import type { ApiError } from "../api/error";
import type { Notices } from "../store/notice-store";

export type RepoAction = "close" | "reopen";

/** One per repo: what the daemon said about the last close or reopen asked of it. */
export type RepoNotices = Notices<{ action: RepoAction; error: ApiError }>;
export type RepoNotice = RepoNotices[string];

const LABEL: Record<RepoAction, string> = { close: "Close", reopen: "Reopen" };

/** The repo is named because the line sits in a sidebar that lists several of them. */
export function repoNoticeLine(notice: RepoNotice, repo: Pick<Repo, "name">): string {
  return `${LABEL[notice.action]} failed for ${repo.name}: ${notice.error.message}`;
}
