import type { Recommendation, RecommendRequest, RecommendResponse } from "@agnostic/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { type ApiError, asApiError } from "../api/error";
import { createDebouncedRequest } from "./debounced-request";

// Long enough that a sentence is one request and short enough to feel like an answer.
const DEBOUNCE_MS = 300;

export type RecommendationState = {
  status: "idle" | "pending" | "ready" | "error";
  /** The last pick, kept while the next one is on its way so the card does not flicker. */
  recommendation: Recommendation | null;
  error: ApiError | null;
};

const IDLE: RecommendationState = { status: "idle", recommendation: null, error: null };

/** agn's pick for what is in the dialog now, asked for once the typing stops. */
export function useRecommendation(
  client: WorkspaceClient,
  request: RecommendRequest | null,
): RecommendationState {
  const [state, setState] = useState<RecommendationState>(IDLE);
  // The request belonging to the key below, read by the effect the key fires.
  const latest = useRef(request);
  latest.current = request;

  const scheduler = useMemo(
    () =>
      createDebouncedRequest<RecommendRequest, RecommendResponse>({
        delayMs: DEBOUNCE_MS,
        run: (input, signal) => client.recommend(input, signal),
        onResult: (_input, response) =>
          setState({ status: "ready", recommendation: response.recommendation, error: null }),
        // A refusal is the daemon's to explain: nothing eligible, or a prompt it would not take.
        onError: (_input, error) =>
          setState({ status: "error", recommendation: null, error: asApiError(error) }),
      }),
    [client],
  );

  const key = request === null ? null : JSON.stringify(request);
  useEffect(() => {
    const current = latest.current;
    if (key === null || current === null) {
      scheduler.cancel();
      setState(IDLE);
      return;
    }
    setState((previous) => ({ ...previous, status: "pending", error: null }));
    scheduler.submit(current);
  }, [key, scheduler]);

  useEffect(() => () => scheduler.cancel(), [scheduler]);

  return state;
}
