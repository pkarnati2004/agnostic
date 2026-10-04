import type { Task, TaskListRow } from "@agnostic/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import type { NoticeHost } from "../store/task-notices";
import type { Workspace } from "../store/use-workspace";
import { type ToastState, useToast } from "../toast/use-toast";
import { type ArchiveOutcome, type ArchiveWarning, archiveWarning } from "./archive-copy";

/** The archive one task's menu or header is still asking about, and whether the retry is running. */
export type ArchiveNotice = { taskId: string; warning: ArchiveWarning; busy: boolean };

/** How long the archived row stays highlighted in History, which is the toast's own lifetime. */
const ARCHIVED_MS = 10_000;

export type ArchiveDelete = {
  archive(taskId: string): Promise<ArchiveOutcome>;
  archiveAnyway(taskId: string): Promise<void>;
  deleteTask(taskId: string): Promise<void>;
  /** The task the delete dialog is about; null while it is closed, and once the row has gone. */
  deleting: TaskListRow | null;
  requestDelete(taskId: string): void;
  closeDelete(): void;
  justArchived: string | null;
  warning: ArchiveNotice | null;
  keep(): void;
  toast: ToastState | null;
  dismissToast(): void;
};

/**
 * Archive and Delete for the whole page: the row menu, the task header and the palette all go
 * through here, so one archive's warning and one archive's toast are what the page shows.
 */
export function useArchiveDelete(
  tasks: Record<string, TaskListRow>,
  client: WorkspaceClient,
  act: Workspace["act"],
  resume: (taskId: string, host: NoticeHost) => Promise<void>,
): ArchiveDelete {
  const { toast, show, dismiss } = useToast(ARCHIVED_MS);
  const [warning, setWarning] = useState<ArchiveNotice | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { justArchived, mark } = useJustArchived();

  const resumeAction = (taskId: string) => ({
    label: "Resume",
    run: () => void resume(taskId, "header"),
  });

  const attempt = async (taskId: string, force: boolean): Promise<ArchiveOutcome> => {
    const task = tasks[taskId] ?? null;
    const title = task?.title ?? taskId;
    const error = await cleanOnce(client, act, taskId, force);
    if (error === null) {
      setWarning(null);
      mark(taskId);
      show({ message: `${title} moved to History`, tone: "info", action: resumeAction(taskId) });
      return { kind: "archived" };
    }
    if (error.code === "worktree-unsaved") {
      const uncommitted = await uncommittedCount(client, taskId);
      const reason = reasonOf(error);
      const text = archiveWarning(reason, uncommitted, task?.branch ?? null);
      setWarning({ taskId, warning: text, busy: false });
      return { kind: "unsaved", reason, uncommitted };
    }
    setWarning(null);
    show({ message: `Archive failed for ${title}: ${error.message}`, tone: "error", action: null });
    return { kind: "failed" };
  };

  const deleteTask = async (taskId: string): Promise<void> => {
    const caught: { error: ApiError | null } = { error: null };
    await act({ taskId, action: "delete", host: "dialog" }, async (api) => {
      try {
        await api.deleteTask(taskId);
      } catch (cause) {
        caught.error = asApiError(cause);
        throw cause;
      }
      // The row and its tab leave on `task.deleted`; there is nothing left to put in the store.
      return undefined;
    });
    if (caught.error !== null) {
      throw caught.error;
    }
  };

  return {
    archive: (taskId) => attempt(taskId, false),
    archiveAnyway: async (taskId) => {
      setWarning((current) => (current === null ? null : { ...current, busy: true }));
      await attempt(taskId, true);
    },
    deleteTask,
    deleting: deletingId === null ? null : (tasks[deletingId] ?? null),
    requestDelete: setDeletingId,
    closeDelete: () => setDeletingId(null),
    justArchived,
    warning,
    keep: () => setWarning(null),
    toast,
    dismissToast: dismiss,
  };
}

/**
 * The clean, with its refusal returned rather than thrown. Uncommitted work is answered in the
 * menu, so that refusal must not reach the page's notices at all - not even to clear an older
 * failure on the same task. The call is made here and only its success or a real failure goes to
 * `act`, which stores the row and clears or records the notice. Handing `act` an answer the page
 * already has costs no second request.
 */
async function cleanOnce(
  client: WorkspaceClient,
  act: Workspace["act"],
  taskId: string,
  force: boolean,
): Promise<ApiError | null> {
  const scope = { taskId, action: "archive" as const, host: "header" as const };
  let task: Task;
  try {
    task = (await client.cleanTask(taskId, force ? { force: true } : {})).task;
  } catch (cause) {
    const error = asApiError(cause);
    if (error.code !== "worktree-unsaved") {
      await act(scope, () => Promise.reject(error));
    }
    return error;
  }
  await act(scope, () => Promise.resolve(task));
  return null;
}

/** How many paths the worktree is holding that no commit has, or null when it could not be read. */
async function uncommittedCount(client: WorkspaceClient, taskId: string): Promise<number | null> {
  return client.changes(taskId).then(
    (response) => response.uncommitted,
    () => null,
  );
}

/** The daemon's message reads "the worktree for task <id> was not removed: <reason>", as `agn
 * clean` reads it too. */
function reasonOf(error: ApiError): string {
  const tail = error.message.split(": ").slice(1).join(": ");
  return tail === "" ? error.message : tail;
}

/** The row the page highlights in History, for as long as the toast about it is up. */
function useJustArchived(): { justArchived: string | null; mark: (taskId: string) => void } {
  const [justArchived, setJustArchived] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => cancel, [cancel]);
  const mark = (taskId: string) => {
    cancel();
    setJustArchived(taskId);
    timer.current = setTimeout(() => {
      timer.current = null;
      setJustArchived(null);
    }, ARCHIVED_MS);
  };
  return { justArchived, mark };
}
