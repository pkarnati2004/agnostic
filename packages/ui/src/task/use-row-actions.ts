import type { TaskListRow } from "@agnostic/core";
import type { WorkspaceClient } from "../api/client";
import type { TaskRowActions } from "../sidebar/task-row-actions";
import type { NoticeHost } from "../store/task-notices";
import type { Workspace } from "../store/use-workspace";
import type { ToastState } from "../toast/use-toast";
import { useArchiveDelete } from "./use-archive-delete";

type RowActionDeps = {
  client: WorkspaceClient;
  tasks: Record<string, TaskListRow>;
  act: Workspace["act"];
  resume: (taskId: string, host: NoticeHost) => Promise<void>;
  stop: (taskId: string) => void;
  openInEditor: (taskId: string) => void;
  /** Opens the task's tab, then its handoff dialog. */
  handoff: (taskId: string) => void;
  /** Opens the Changes column and its Create PR dialog, as the palette's row does. */
  createPr: (taskId: string) => void;
};

/**
 * The handlers every task menu reads, gathered once: the page's own Stop, Resume, Hand off and
 * Create PR, with Archive and Delete from the hook that owns them.
 */
export function useRowActions(deps: RowActionDeps): {
  actions: TaskRowActions;
  deleting: TaskListRow | null;
  onDelete: (taskId: string) => Promise<void>;
  closeDelete: () => void;
  toast: ToastState | null;
  dismissToast: () => void;
} {
  const archiving = useArchiveDelete(deps.tasks, deps.client, deps.act, deps.resume);
  return {
    actions: {
      copy: (text) => navigator.clipboard.writeText(text),
      openInEditor: deps.openInEditor,
      stop: deps.stop,
      resume: (taskId) => void deps.resume(taskId, "header"),
      handoff: deps.handoff,
      createPr: deps.createPr,
      archive: archiving.archive,
      archiveAnyway: archiving.archiveAnyway,
      requestDelete: archiving.requestDelete,
      justArchived: archiving.justArchived,
      warning: archiving.warning,
      keep: archiving.keep,
    },
    deleting: archiving.deleting,
    onDelete: archiving.deleteTask,
    closeDelete: archiving.closeDelete,
    toast: archiving.toast,
    dismissToast: archiving.dismissToast,
  };
}
