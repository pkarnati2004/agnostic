import type { Task } from "@agnostic/core";
import { useCallback, useEffect, useReducer, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import type { ApiError } from "../api/error";
import { asApiError } from "../api/error";
import { useNotices } from "./notice-store";
import type { NoticeHost, TaskAction, TaskNotice, TaskNotices } from "./task-notices";
import {
  EMPTY_WORKSPACE,
  REFETCH_KINDS,
  type WorkspaceAction,
  type WorkspaceState,
  workspaceReducer,
} from "./workspace-state";

/** Which task the click was about, and where its answer belongs. */
export type ActionScope = { taskId: string; action: TaskAction; host: NoticeHost };

export type Workspace = {
  state: WorkspaceState;
  /** Set by the bootstrap only: a page that never loaded has no task to say so on. */
  error: ApiError | null;
  /** The latest failure per task, each one shown where it was asked for. */
  notices: TaskNotices;
  /** Returns the task the call answered with, or undefined when it failed. */
  act(
    scope: ActionScope,
    run: (client: WorkspaceClient) => Promise<Task | undefined>,
  ): Promise<Task | undefined>;
  /** A row that already arrived whole (the new-task dialog's answer); nothing here can fail. */
  put(task: Task): void;
};

/** The page's one connection to the daemon: a snapshot, then the feed, for as long as it is open. */
export function useWorkspace(client: WorkspaceClient): Workspace {
  const [state, dispatch] = useReducer(workspaceReducer, EMPTY_WORKSPACE);
  const [error, setError] = useState<ApiError | null>(null);
  const { notices, failed, cleared } = useNotices<Omit<TaskNotice, "at">>();

  useEffect(() => {
    const abort = new AbortController();
    followWorkspace(client, dispatch, abort.signal).catch((cause: unknown) => {
      if (!abort.signal.aborted) {
        setError(asApiError(cause));
      }
    });
    return () => abort.abort();
  }, [client]);

  const act = useCallback(
    async (scope: ActionScope, run: (client: WorkspaceClient) => Promise<Task | undefined>) => {
      try {
        const task = await run(client);
        if (task !== undefined) {
          dispatch({ type: "task", task });
        }
        cleared(scope.taskId);
        return task;
      } catch (cause) {
        failed(scope.taskId, { action: scope.action, host: scope.host, error: asApiError(cause) });
        return undefined;
      }
    },
    [client, cleared, failed],
  );

  const put = useCallback((task: Task) => dispatch({ type: "task", task }), []);

  return { state, error, notices, act, put };
}

/** The bootstrap and the feed behind the hook: both snapshots, then every event after the cursor. */
export async function followWorkspace(
  client: WorkspaceClient,
  dispatch: (action: WorkspaceAction) => void,
  signal: AbortSignal,
): Promise<void> {
  const [repos, tasks] = await Promise.all([client.listRepos(), client.listTasks()]);
  // Each snapshot is at least as new as its own cursor, so the feed resumes from the older of the
  // two; an event in both a snapshot and the replay is applied once (ADR 030).
  const cursor = Math.min(repos.cursor, tasks.cursor);
  dispatch({ type: "loaded", repos: repos.repos, tasks: tasks.tasks, cursor });
  const known = new Set(tasks.tasks.map((task) => task.id));
  for await (const event of client.events(cursor, signal)) {
    dispatch({ type: "event", event });
    const id = event.taskId;
    if (id === undefined) {
      continue;
    }
    // A created task arrives whole; the kinds that change more than they carry are re-read.
    if (event.kind === "task.created") {
      known.add(id);
      continue;
    }
    if (!REFETCH_KINDS.has(event.kind) && known.has(id)) {
      continue;
    }
    // A row that has gone is not a reason to stop reading the feed.
    const response = await client.getTask(id).catch(() => null);
    if (response !== null) {
      known.add(id);
      dispatch({ type: "task", task: response.task });
    }
  }
}
