import { useCallback, useEffect, useReducer, useRef } from "react";
import { NOTICE_TTL_MS, noticesReducer, type TaskNotice, type TaskNotices } from "./task-notices";

export type TaskNoticesHandle = {
  notices: TaskNotices;
  failed(taskId: string, notice: Omit<TaskNotice, "at">): void;
  cleared(taskId: string): void;
};

/** A failure shows where the click was and takes itself away again, so nothing has to be dismissed. */
export function useTaskNotices(ttlMs: number = NOTICE_TTL_MS): TaskNoticesHandle {
  const [notices, dispatch] = useReducer(noticesReducer, {});
  // One timer per task: a task holds one notice, so its older timer is about a notice that is gone.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    };
  }, []);

  const cancel = useCallback((taskId: string) => {
    const timer = timers.current.get(taskId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(taskId);
    }
  }, []);

  const failed = useCallback(
    (taskId: string, notice: Omit<TaskNotice, "at">) => {
      cancel(taskId);
      const at = Date.now();
      dispatch({ type: "failed", taskId, notice: { ...notice, at } });
      timers.current.set(
        taskId,
        setTimeout(() => {
          timers.current.delete(taskId);
          dispatch({ type: "expired", taskId, at });
        }, ttlMs),
      );
    },
    [cancel, ttlMs],
  );

  const cleared = useCallback(
    (taskId: string) => {
      cancel(taskId);
      dispatch({ type: "cleared", taskId });
    },
    [cancel],
  );

  return { notices, failed, cleared };
}
