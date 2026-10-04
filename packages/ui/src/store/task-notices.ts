import type { Task } from "@agnostic/core";
import type { ApiError } from "../api/error";
import type { Notices } from "./notice-store";

export type TaskAction =
  | "stop"
  | "resume"
  | "handoff"
  | "open"
  | "pr"
  | "update"
  | "commit"
  | "pick"
  | "archive"
  | "delete";

/** Where the click happened, which is where the answer shows. */
export type NoticeHost = "header" | "overlay" | "dialog" | "panel" | "compare";

/** One per task: the latest failure, because an older one is no longer what the daemon said. */
export type TaskNotices = Notices<{ action: TaskAction; host: NoticeHost; error: ApiError }>;
export type TaskNotice = TaskNotices[string];

const LABEL: Record<TaskAction, string> = {
  stop: "Stop",
  resume: "Resume",
  handoff: "Hand off",
  open: "Open in editor",
  pr: "Create PR",
  update: "Bring up to date",
  commit: "Ask the agent to commit",
  pick: "Pick",
  archive: "Archive",
  delete: "Delete",
};

/** The task is named because the failure shows on a page that has several of them open. */
export function noticeLine(notice: TaskNotice, task: Pick<Task, "title">): string {
  return `${LABEL[notice.action]} failed for ${task.title}: ${notice.error.message}`;
}
