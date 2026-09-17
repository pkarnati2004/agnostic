import type { Task } from "@agnostic/core";
import type { ApiError } from "../api/error";

export type TaskAction = "stop" | "resume" | "handoff";

/** Where the click happened, which is where the answer shows. */
export type NoticeHost = "header" | "overlay" | "dialog";

export type TaskNotice = { action: TaskAction; host: NoticeHost; error: ApiError; at: number };

/** One per task: the latest failure, because an older one is no longer what the daemon said. */
export type TaskNotices = Record<string, TaskNotice>;

export type NoticesAction =
  | { type: "failed"; taskId: string; notice: TaskNotice }
  /** The next action on that task succeeded, so what failed before is answered. */
  | { type: "cleared"; taskId: string }
  | { type: "expired"; taskId: string; at: number };

/** Long enough to read the hint, short enough that a stale line is never read as the state now. */
export const NOTICE_TTL_MS = 8000;

const LABEL: Record<TaskAction, string> = {
  stop: "Stop",
  resume: "Resume",
  handoff: "Hand off",
};

export function noticesReducer(state: TaskNotices, action: NoticesAction): TaskNotices {
  switch (action.type) {
    case "failed":
      return { ...state, [action.taskId]: action.notice };
    case "cleared":
      return without(state, action.taskId);
    case "expired":
      // A second failure restarted the clock, so an older timer is about a notice that is gone.
      return state[action.taskId]?.at === action.at ? without(state, action.taskId) : state;
  }
}

/** The task is named because the failure shows on a page that has several of them open. */
export function noticeLine(notice: TaskNotice, task: Pick<Task, "title">): string {
  return `${LABEL[notice.action]} failed for ${task.title}: ${notice.error.message}`;
}

function without(state: TaskNotices, taskId: string): TaskNotices {
  if (state[taskId] === undefined) {
    return state;
  }
  return Object.fromEntries(Object.entries(state).filter(([id]) => id !== taskId));
}
