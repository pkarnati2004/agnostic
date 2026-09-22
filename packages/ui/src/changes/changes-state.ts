import type { ChangedFile, ChangesResponse } from "@agnostic/core";
import type { ApiError } from "../api/error";

/**
 * What the panel is showing and where its read of `GET /tasks/:id/changes` got to. Every state but
 * `idle` can carry the last body that arrived, so a refresh never blanks the list being read.
 */
export type ChangesState =
  | { kind: "idle" }
  | { kind: "loading"; previous: ChangesResponse | null }
  | { kind: "ready"; response: ChangesResponse; fetchedAt: number }
  | { kind: "error"; error: ApiError; previous: ChangesResponse | null };

export type ChangesAction =
  | { type: "fetch" }
  | { type: "loaded"; response: ChangesResponse; at: number }
  | { type: "failed"; error: ApiError }
  /** The panel is about another task now, so nothing it holds is about the task in front. */
  | { type: "reset" };

export const IDLE_CHANGES: ChangesState = { kind: "idle" };

export function changesReducer(state: ChangesState, action: ChangesAction): ChangesState {
  switch (action.type) {
    case "fetch":
      return { kind: "loading", previous: lastChanges(state) };
    case "loaded":
      return { kind: "ready", response: action.response, fetchedAt: action.at };
    case "failed":
      return { kind: "error", error: action.error, previous: lastChanges(state) };
    case "reset":
      return IDLE_CHANGES;
  }
}

/** The newest body the panel has, whatever happened since it arrived. */
export function lastChanges(state: ChangesState): ChangesResponse | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "ready":
      return state.response;
    default:
      return state.previous;
  }
}

/** One file's patch, or why it could not be read; the path says which file it answers for. */
export type PatchState = { path: string; patch: string } | { path: string; error: ApiError } | null;

/** The path to select after a load: the one already selected while it is still listed, else the
 * first row, else nothing. */
export function selectedAfterLoad(current: string | null, files: ChangedFile[]): string | null {
  if (current !== null && files.some((file) => file.path === current)) {
    return current;
  }
  return files[0]?.path ?? null;
}
