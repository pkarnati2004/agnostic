import type { TaskListRow, TaskStatus } from "@agnostic/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";
import {
  type ChangesState,
  changesReducer,
  IDLE_CHANGES,
  type PatchState,
  selectedAfterLoad,
} from "./changes-state";

export type Changes = {
  state: ChangesState;
  patch: PatchState;
  selected: string | null;
  select(path: string): void;
  refresh(): void;
};

/** What makes a read stale: the task itself, what it is doing, whether its worktree is there, and
 * a click on Refresh. `updatedAt` is not one of them: it moves with the status. */
type Read = { taskId: string; status: TaskStatus | null; worktree: boolean; asked: number };

/**
 * The panel's read of one task: the file list, and the patch of the file selected in it. Nothing
 * watches the worktree, so the list is re-read on those four occasions only (ADR 036, brief §5).
 * Each read re-reads the selected file too, which is how the agent's latest edits arrive.
 *
 * The handoff's `enabled` flag is not a parameter: the panel is mounted only while the column is
 * open, so opening it is what mounts this hook and starts the first read.
 */
export function useChanges(client: WorkspaceClient, task: TaskListRow | null): Changes {
  const [state, dispatch] = useReducer(changesReducer, IDLE_CHANGES);
  const [selected, setSelected] = useState<string | null>(null);
  const [patch, setPatch] = useState<PatchState>(null);
  const [asked, setAsked] = useState(0);
  // The selection is read by the load without being one of its triggers: picking a file must not
  // re-read the list.
  const shown = useRef<string | null>(null);
  // An answer about a task or a path the panel has moved on from is dropped, never drawn.
  const wanted = useRef<{ taskId: string | null; path: string | null }>({
    taskId: null,
    path: null,
  });
  const read = useRef<Read | null>(null);

  const taskId = task?.id ?? null;
  const status = task?.status ?? null;
  const worktree = task?.worktreePresent ?? false;

  const loadPatch = useCallback(
    (id: string, path: string) => {
      wanted.current = { taskId: id, path };
      const fresh = () => wanted.current.taskId === id && wanted.current.path === path;
      void client.diff(id, path).then(
        (response) => {
          if (fresh()) {
            setPatch({ path, patch: response.patch });
          }
        },
        (cause: unknown) => {
          if (fresh()) {
            setPatch({ path, error: asApiError(cause) });
          }
        },
      );
    },
    [client],
  );

  const select = useCallback(
    (path: string) => {
      if (taskId === null) {
        return;
      }
      shown.current = path;
      setSelected(path);
      loadPatch(taskId, path);
    },
    [taskId, loadPatch],
  );

  useEffect(() => {
    if (taskId === null) {
      return;
    }
    const last = read.current;
    read.current = { taskId, status, worktree, asked };
    // Another task: nothing the panel holds is about the one in front of it now.
    if (last?.taskId !== taskId) {
      shown.current = null;
      wanted.current = { taskId: null, path: null };
      setSelected(null);
      setPatch(null);
      dispatch({ type: "reset" });
    }
    let live = true;
    dispatch({ type: "fetch" });
    void client.changes(taskId).then(
      (response) => {
        if (!live) {
          return;
        }
        dispatch({ type: "loaded", response, at: Date.now() });
        const next = selectedAfterLoad(shown.current, response.files);
        shown.current = next;
        setSelected(next);
        if (next === null) {
          setPatch(null);
        } else {
          loadPatch(taskId, next);
        }
      },
      (cause: unknown) => {
        if (live) {
          dispatch({ type: "failed", error: asApiError(cause) });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [client, taskId, status, worktree, asked, loadPatch]);

  return { state, patch, selected, select, refresh: () => setAsked((count) => count + 1) };
}
