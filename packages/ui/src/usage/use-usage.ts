import { useEffect, useReducer, useRef } from "react";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { browserTimers, createRefreshScheduler, type RefreshScheduler } from "./usage-refresh";
import { IDLE_USAGE, type UsageState, usageReducer } from "./usage-state";

/** `stamp` is the workspace's `usage.recorded` counter: every change is one poke at the scheduler. */
export function useUsage(client: WorkspaceClient, stamp: number): UsageState {
  const [state, dispatch] = useReducer(usageReducer, IDLE_USAGE);
  const scheduler = useRef<RefreshScheduler | null>(null);
  const seen = useRef(stamp);

  useEffect(() => {
    const refresh = createRefreshScheduler({
      timers: browserTimers,
      visible: () => document.visibilityState === "visible",
      run: async () => {
        dispatch({ type: "fetch" });
        try {
          dispatch({ type: "loaded", response: await client.usage(), at: Date.now() });
        } catch (cause) {
          dispatch({ type: "failed", error: asApiError(cause) });
        }
      },
    });
    const onVisibility = () => refresh.visibilityChanged(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    scheduler.current = refresh;
    refresh.start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      refresh.stop();
      scheduler.current = null;
    };
  }, [client]);

  useEffect(() => {
    // The stamp this hook mounted with is already covered by the scheduler's first read.
    if (seen.current === stamp) {
      return;
    }
    seen.current = stamp;
    scheduler.current?.poke();
  }, [stamp]);

  return state;
}

function asApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) {
    return cause;
  }
  return new ApiError(cause instanceof Error ? cause.message : "usage could not be read", {
    code: "usage-failed",
    status: null,
    cause,
  });
}
