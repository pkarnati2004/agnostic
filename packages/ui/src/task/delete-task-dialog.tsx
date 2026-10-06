import type { ChangedFile, RepoListRow, TaskListRow } from "@agnostic/core";
import { Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import { Button } from "../components/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";
import { HintText } from "../hint-text";
import { NoticeLine } from "../notice/notice-line";
import { busyLabel, deleteCopy } from "./delete-task-copy";

type DeleteTaskDialogProps = {
  /** The task the user asked to delete, or null while nothing is being deleted. */
  task: TaskListRow | null;
  repo: RepoListRow | null;
  client: WorkspaceClient;
  onOpenChange: (open: boolean) => void;
  /** Rejects when the daemon refused, so the answer shows in the dialog the click was in. */
  onDelete: (taskId: string) => Promise<void>;
};

/** The click that removes a task's records for good, so it says what goes and what stays. */
export function DeleteTaskDialog({ task, ...on }: DeleteTaskDialogProps) {
  // Keyed by task, so a second one opens without the first's refusal or its in-flight state under it.
  return task === null ? null : <Confirm key={task.id} task={task} {...on} />;
}

type ConfirmProps = Omit<DeleteTaskDialogProps, "task"> & { task: TaskListRow };

function Confirm({ task, repo, client, onOpenChange, onDelete }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const copy = deleteCopy(task, repo?.name ?? null, useUncommitted(client, task));
  const remove = () => {
    setBusy(true);
    setFailure(null);
    onDelete(task.id).then(
      () => {
        setBusy(false);
        // The row leaves the sidebar through `task.deleted`, and the tab with it, not from here.
        onOpenChange(false);
      },
      (cause: unknown) => {
        setBusy(false);
        setFailure(asApiError(cause));
      },
    );
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-muted-foreground type-body">
            <HintText hint={copy.body} />
          </p>
          {copy.warning !== null && (
            <Lost warning={copy.warning} files={copy.files} more={copy.more} />
          )}
          {failure !== null && <Refusal failure={failure} />}
        </DialogBody>
        <DialogFooter className="items-center">
          {busy && (
            <span className="mr-auto text-muted-foreground type-meta">{busyLabel(task)}</span>
          )}
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            <Trash2 />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the worktree is still holding, named: the removal takes it with it. */
function Lost({ warning, files, more }: { warning: string; files: string[]; more: number }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      style={{ backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}
    >
      <TriangleAlert className="mt-[2px] size-3.5 shrink-0" style={{ color: "var(--warning)" }} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[12.5px]" style={{ color: "var(--warning)" }}>
          {warning}
        </span>
        <span className="truncate text-muted-foreground type-mono">
          {[...files, ...(more > 0 ? [`+${more}`] : [])].join(" · ")}
        </span>
      </span>
    </div>
  );
}

function Refusal({ failure }: { failure: ApiError }) {
  return (
    <NoticeLine tone="error" className="border-b-0 px-0">
      {failure.message}
      {failure.hint !== null && (
        <span className="mt-0.5 block text-muted-foreground">
          <HintText hint={failure.hint} />
        </span>
      )}
    </NoticeLine>
  );
}

/**
 * What the task's worktree is holding that no commit has: the paths the delete would take with it.
 * Null while the read is in flight, for a task with no worktree, and when the read failed - a
 * dialog with no list is better than one that refuses to open.
 */
function useUncommitted(client: WorkspaceClient, task: TaskListRow): ChangedFile[] | null {
  const [files, setFiles] = useState<ChangedFile[] | null>(null);
  useEffect(() => {
    if (!task.worktreePresent) {
      return;
    }
    let live = true;
    void client.changes(task.id).then(
      (response) => {
        if (live) {
          setFiles(response.files.filter((file) => file.state !== "committed"));
        }
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, task.id, task.worktreePresent]);
  return files;
}
