import type { CompareResponse } from "@agnostic/core";
import type { ApiError } from "../api/error";

/**
 * What the Compare view is showing and where its read of `GET /compares/:id` got to. Every state
 * but `idle` can carry the last body that arrived, so a refresh never blanks the columns.
 */
export type CompareState =
  | { kind: "idle" }
  | { kind: "loading"; previous: CompareResponse | null }
  | { kind: "ready"; response: CompareResponse; fetchedAt: number }
  | { kind: "error"; error: ApiError; previous: CompareResponse | null };

export type CompareAction =
  | { type: "fetch" }
  | { type: "loaded"; response: CompareResponse; at: number }
  | { type: "failed"; error: ApiError }
  /** The view is about another compare now, so nothing it holds is about the one in front. */
  | { type: "reset" };

export const IDLE_COMPARE: CompareState = { kind: "idle" };

export function compareReducer(state: CompareState, action: CompareAction): CompareState {
  switch (action.type) {
    case "fetch":
      return { kind: "loading", previous: lastCompare(state) };
    case "loaded":
      return { kind: "ready", response: action.response, fetchedAt: action.at };
    case "failed":
      return { kind: "error", error: action.error, previous: lastCompare(state) };
    case "reset":
      return IDLE_COMPARE;
  }
}

/** The newest body the view has, whatever happened since it arrived. */
export function lastCompare(state: CompareState): CompareResponse | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "ready":
      return state.response;
    default:
      return state.previous;
  }
}
