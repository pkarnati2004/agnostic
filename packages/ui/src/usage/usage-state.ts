import type { UsageResponse } from "@agnostic/core";
import type { ApiError } from "../api/error";

/**
 * What the bar is showing and where it got to. Every state but `idle` can carry the last body that
 * arrived, so a scan that is slow or that fails never blanks figures the user was reading.
 */
export type UsageState =
  | { kind: "idle" }
  | { kind: "loading"; previous: UsageResponse | null }
  | { kind: "ready"; response: UsageResponse; fetchedAt: number }
  | { kind: "error"; error: ApiError; previous: UsageResponse | null };

export type UsageAction =
  | { type: "fetch" }
  | { type: "loaded"; response: UsageResponse; at: number }
  | { type: "failed"; error: ApiError };

export const IDLE_USAGE: UsageState = { kind: "idle" };

export function usageReducer(state: UsageState, action: UsageAction): UsageState {
  switch (action.type) {
    case "fetch":
      return { kind: "loading", previous: lastResponse(state) };
    case "loaded":
      return { kind: "ready", response: action.response, fetchedAt: action.at };
    case "failed":
      return { kind: "error", error: action.error, previous: lastResponse(state) };
  }
}

/** The newest body the bar has, whatever happened since it arrived. */
export function lastResponse(state: UsageState): UsageResponse | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "ready":
      return state.response;
    default:
      return state.previous;
  }
}
