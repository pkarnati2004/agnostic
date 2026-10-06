import type { TaskListRow, TaskStatus } from "@agnostic/core";
import { isClosed, isLive } from "@agnostic/core/browser";
import { worktreeGone } from "../task/worktree-gone";
import { inHistory } from "./group-tasks";

/** A row's own menu carries everything; the task header's leaves out what its buttons already are. */
export type MenuPlacement = "row" | "header";

export type MenuItem = {
  id:
    | "copy-branch"
    | "copy-id"
    | "copy-attach"
    | "open"
    | "stop"
    | "resume"
    | "handoff"
    | "pr"
    | "archive"
    | "delete";
  label: string;
  /** Drawn after the label in mono: the task id on Copy task id. */
  meta: string | null;
  /** Non-null means disabled, and this is the tooltip. */
  disabled: string | null;
  tooltip: string | null;
  tone: "default" | "destructive";
};

export type MenuSection = {
  id: "copy" | "open" | "lifecycle" | "archive" | "delete";
  items: MenuItem[];
};

const ACTIVE: TaskStatus[] = ["queued", "running", "waiting"];

export const ARCHIVE_TOOLTIP =
  "Removes the worktree. The task moves to History; Resume rebuilds it from its branch.";
const HISTORY_RESUME = "Rebuilds the worktree from its branch";
const STOP_FIRST = "Stop the task first";

/** Sections in the design's order; an empty section is left out. */
export function menuSections(task: TaskListRow, placement: MenuPlacement): MenuSection[] {
  const sections: MenuSection[] = [
    { id: "copy", items: copyItems(task) },
    { id: "open", items: openItems(task) },
    { id: "lifecycle", items: placement === "header" ? [] : lifecycleItems(task) },
    { id: "archive", items: placement === "header" ? [] : archiveItems(task) },
    { id: "delete", items: [deleteItem(task)] },
  ];
  return sections.filter((section) => section.items.length > 0);
}

function copyItems(task: TaskListRow): MenuItem[] {
  const items: MenuItem[] = [];
  if (task.branch !== null) {
    items.push(item("copy-branch", "Copy branch name"));
  }
  items.push({ ...item("copy-id", "Copy task id"), meta: task.id });
  if (isLive(task.status)) {
    items.push(item("copy-attach", "Copy attach command"));
  }
  return items;
}

/** A task in History has no worktree to open, and no row offering to open one either. */
function openItems(task: TaskListRow): MenuItem[] {
  if (inHistory(task) || !task.worktreePresent) {
    return [];
  }
  return [item("open", "Open in editor")];
}

/**
 * What can still be done with the task itself. A queued row gets none: it is inside the launch
 * that made it, and the daemon would refuse every one of them (ADR 014).
 */
function lifecycleItems(task: TaskListRow): MenuItem[] {
  if (inHistory(task)) {
    return [{ ...item("resume", "Resume"), tooltip: HISTORY_RESUME }];
  }
  if (isLive(task.status)) {
    return [item("stop", "Stop"), item("handoff", "Hand off"), ...prItem(task)];
  }
  if (isClosed(task.status) && !worktreeGone(task)) {
    return [item("resume", "Resume"), item("handoff", "Hand off"), ...prItem(task)];
  }
  return [];
}

function prItem(task: TaskListRow): MenuItem[] {
  return task.branch === null ? [] : [item("pr", "Create PR")];
}

/** Archive is offered where agn has a worktree to remove and no agent is in it. */
export function canArchive(task: TaskListRow): boolean {
  return isClosed(task.status) && task.worktreePresent;
}

/** The daemon refuses a delete while the task is queued, running or waiting. */
export function canDelete(task: TaskListRow): boolean {
  return !ACTIVE.includes(task.status);
}

function archiveItems(task: TaskListRow): MenuItem[] {
  if (!canArchive(task)) {
    return [];
  }
  return [{ ...item("archive", "Archive"), tooltip: ARCHIVE_TOOLTIP }];
}

function deleteItem(task: TaskListRow): MenuItem {
  return {
    ...item("delete", "Delete…"),
    disabled: canDelete(task) ? null : STOP_FIRST,
    tone: "destructive",
  };
}

function item(id: MenuItem["id"], label: string): MenuItem {
  return { id, label, meta: null, disabled: null, tooltip: null, tone: "default" };
}
