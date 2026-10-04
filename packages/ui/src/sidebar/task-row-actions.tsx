import { createContext, type ReactNode, useContext } from "react";
import type { ArchiveOutcome } from "../task/archive-copy";
import type { ArchiveNotice } from "../task/use-archive-delete";

/**
 * Everything a task's own menu can ask for, wherever the menu is drawn. Every row in the sidebar
 * and the task header read the same handlers, so the page provides them once rather than threading
 * ten callbacks through four components.
 */
export type TaskRowActions = {
  copy(text: string): Promise<void>;
  openInEditor(taskId: string): void;
  stop(taskId: string): void;
  resume(taskId: string): void;
  handoff(taskId: string): void;
  createPr(taskId: string): void;
  archive(taskId: string): Promise<ArchiveOutcome>;
  archiveAnyway(taskId: string): Promise<void>;
  /** Opens the confirmation; nothing is deleted until the dialog is answered. */
  requestDelete(taskId: string): void;
  /** The task archived in the last 10 s, highlighted in History with "Archived just now". */
  justArchived: string | null;
  /** The archive the daemon held back, answered in the menu or under the task header. */
  warning: ArchiveNotice | null;
  keep(): void;
};

const TaskRowActionsContext = createContext<TaskRowActions | null>(null);

export function TaskRowActionsProvider({
  value,
  children,
}: {
  value: TaskRowActions;
  children: ReactNode;
}) {
  return <TaskRowActionsContext.Provider value={value}>{children}</TaskRowActionsContext.Provider>;
}

export function useTaskRowActions(): TaskRowActions {
  const actions = useContext(TaskRowActionsContext);
  if (actions === null) {
    throw new Error("a task menu needs a TaskRowActionsProvider above it");
  }
  return actions;
}
