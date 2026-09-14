import type { TaskUsageResponse } from "@agnostic/core";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { POKE_DEBOUNCE_MS } from "./usage-refresh";

/**
 * One task's tokens, read when it is selected and again after each `usage.recorded` the ledger
 * writes for it. A read that fails leaves the last figures on screen: the header is not the place
 * a scan problem is reported.
 */
export function useTaskUsage(
  client: WorkspaceClient,
  taskId: string | null,
  stamp: number,
): TaskUsageResponse | null {
  const [usage, setUsage] = useState<TaskUsageResponse | null>(null);
  const shown = useRef<{ taskId: string; stamp: number } | null>(null);

  useEffect(() => {
    if (taskId === null) {
      shown.current = null;
      setUsage(null);
      return;
    }
    const last = shown.current;
    shown.current = { taskId, stamp };
    let live = true;
    const read = () => {
      void client.taskUsage(taskId).then(
        (response) => {
          if (live) {
            setUsage(response);
          }
        },
        () => undefined,
      );
    };
    // A task the header has just switched to shows its own figures at once; an event waits 1 s.
    if (last === null || last.taskId !== taskId) {
      setUsage(null);
      read();
      return () => {
        live = false;
      };
    }
    const handle = setTimeout(read, POKE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [client, taskId, stamp]);

  return usage;
}
