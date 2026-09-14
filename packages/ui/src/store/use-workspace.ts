import type { Task } from "@agnostic/core";
import { useCallback, useEffect, useReducer, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import {
  EMPTY_WORKSPACE,
  REFETCH_KINDS,
  type WorkspaceAction,
  type WorkspaceState,
  workspaceReducer,
} from "./workspace-state";

export type Workspace = {
  state: WorkspaceState;
  /** The last call that failed, shown until the next one succeeds. */
  error: ApiError | null;
  act(run: (client: WorkspaceClient) => Promise<Task | undefined>): Promise<void>;
};

/** The page's one connection to the daemon: a snapshot, then the feed, for as long as it is open. */
export function useWorkspace(client: WorkspaceClient): Workspace {
  const [state, dispatch] = useReducer(workspaceReducer, EMPTY_WORKSPACE);
  const [error, setError] = useState<ApiError | null>(null);

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
    async (run: (client: WorkspaceClient) => Promise<Task | undefined>) => {
      try {
        const task = await run(client);
        if (task !== undefined) {
          dispatch({ type: "task", task });
        }
        setError(null);
      } catch (cause) {
        setError(asApiError(cause));
      }
    },
    [client],
  );

  return { state, error, act };
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

function asApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) {
    return cause;
  }
  return new ApiError(cause instanceof Error ? cause.message : "the workspace hit an error", {
    code: "workspace-failed",
    status: null,
    cause,
  });
}
