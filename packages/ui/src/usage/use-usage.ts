import { useCallback, useEffect, useReducer, useRef } from "react";
import type { WorkspaceClient } from "../api/client";
import { ApiError } from "../api/error";
import { browserTimers, createRefreshScheduler, type RefreshScheduler } from "./usage-refresh";
import { IDLE_USAGE, type UsageState, usageReducer } from "./usage-state";

/**
 * `stamp` is the workspace's `usage.recorded` counter: every change is one poke at the scheduler.
 * `refresh` is the read the bar asks for itself, after a write of its own that the figures should
 * already show; the scheduler's own debounce would make the user wait a second for it.
 */
export function useUsage(
  client: WorkspaceClient,
  stamp: number,
): { state: UsageState; refresh: () => void } {
  const [state, dispatch] = useReducer(usageReducer, IDLE_USAGE);
  const scheduler = useRef<RefreshScheduler | null>(null);
  const seen = useRef(stamp);
  const read = useCallback(async () => {
    dispatch({ type: "fetch" });
    try {
      dispatch({ type: "loaded", response: await client.usage(), at: Date.now() });
    } catch (cause) {
      dispatch({ type: "failed", error: asApiError(cause) });
    }
  }, [client]);

  const refresh = useCallback(() => void read(), [read]);

  useEffect(() => {
    const polling = createRefreshScheduler({
      timers: browserTimers,
      visible: () => document.visibilityState === "visible",
      run: read,
    });
    const onVisibility = () => polling.visibilityChanged(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    scheduler.current = polling;
    polling.start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      polling.stop();
      scheduler.current = null;
    };
  }, [read]);

  useEffect(() => {
    // The stamp this hook mounted with is already covered by the scheduler's first read.
    if (seen.current === stamp) {
      return;
    }
    seen.current = stamp;
    scheduler.current?.poke();
  }, [stamp]);

  return { state, refresh };
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
