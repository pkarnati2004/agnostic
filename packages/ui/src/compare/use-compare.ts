import type { TaskListRow } from "@agnostic/core";
import { useEffect, useReducer, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { asApiError } from "../api/error";
import type { UsageStamp } from "../store/workspace-state";
import { type CompareState, compareReducer, IDLE_COMPARE } from "./compare-state";

export type Compare = { state: CompareState; refresh(): void };

/**
 * The view's read of one compare. Nothing watches the worktrees, so the read is repeated when a
 * sibling's status or worktree changes, when a usage row lands for one of them, and on Refresh; no
 * timer fetches anything (brief §5). `outcome.recorded` is not in the workspace reducer, so the
 * tests column can lag a stop by seconds until the next event or a click on Refresh.
 */
export function useCompare(
  client: WorkspaceClient,
  compareId: string | null,
  siblings: TaskListRow[],
  usageStamp: UsageStamp,
): Compare {
  const [state, dispatch] = useReducer(compareReducer, IDLE_COMPARE);
  const [asked, setAsked] = useState(0);
  // What the last read was about: another compare means nothing the view holds is about this one.
  const read = useRef<{ compareId: string; stamp: string; asked: number } | null>(null);
  const stamp = siblings
    .map((task) => [task.id, task.status, task.worktreePresent, usageStamp.byTask[task.id] ?? 0])
    .map((parts) => parts.join(":"))
    .join(",");

  useEffect(() => {
    if (compareId === null) {
      return;
    }
    const last = read.current;
    read.current = { compareId, stamp, asked };
    if (last?.compareId !== compareId) {
      dispatch({ type: "reset" });
    }
    // An answer the view has already asked past is dropped, never drawn.
    let live = true;
    dispatch({ type: "fetch" });
    void client.compare(compareId).then(
      (response) => {
        if (live) {
          dispatch({ type: "loaded", response, at: Date.now() });
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
  }, [client, compareId, stamp, asked]);

  return { state, refresh: () => setAsked((count) => count + 1) };
}
