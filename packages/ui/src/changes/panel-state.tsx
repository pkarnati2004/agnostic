import type { ChangesResponse } from "@agnostic/core";
import { Folder } from "lucide-react";
import type { ApiError } from "../api/error";
import { HintText } from "../hint-text";
import { NoticeLine } from "../notice/notice-line";
import { type ChangesState, lastChanges } from "./changes-state";

/** What the panel draws now: the list, or the one line that stands in for it. */
export type PanelView =
  | { kind: "loading" }
  | { kind: "folder"; error: ApiError }
  | { kind: "failed"; error: ApiError }
  | { kind: "changes"; response: ChangesResponse };

/**
 * A failure is shown instead of the list it failed to refresh: `repo-not-git` and `branch-gone`
 * describe the task, not a click, so they belong in the panel rather than in a notice (ADR 036).
 */
export function panelView(state: ChangesState): PanelView {
  if (state.kind === "error") {
    return state.error.code === "repo-not-git"
      ? { kind: "folder", error: state.error }
      : { kind: "failed", error: state.error };
  }
  const response = lastChanges(state);
  return response === null ? { kind: "loading" } : { kind: "changes", response };
}

export function LoadingLine() {
  return <PanelLine>Loading changes…</PanelLine>;
}

export function LoadingPatch() {
  return <PanelLine>Loading the patch…</PanelLine>;
}

/** A folder repo has no git to read; the daemon's hint says how to give it one. */
export function FolderLine({ error }: { error: ApiError }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 p-6 text-center">
      <Folder className="size-[18px] text-muted-foreground" />
      <p className="text-[13px]">This folder is not a git repo.</p>
      <Hint hint={error.hint} />
    </div>
  );
}

export function FailedLine({ error }: { error: ApiError }) {
  return (
    <div role="alert" className="px-4 py-3">
      <p className="text-destructive text-sm">{error.message}</p>
      <Hint hint={error.hint} />
    </div>
  );
}

/** The worktree is gone but the branch is not, so what was committed still reads (ADR 031). */
export function CleanedLine({ branch }: { branch: string }) {
  return (
    <NoticeLine tone="info" className="border-b-0">
      <HintText hint={`worktree cleaned; branch \`${branch}\` kept`} />
    </NoticeLine>
  );
}

export function EmptyLine({ base }: { base: string }) {
  return <PanelLine>{`No changes against \`${base}\` yet.`}</PanelLine>;
}

function PanelLine({ children }: { children: string }) {
  return (
    <p className="px-4 py-3 text-muted-foreground text-sm">
      <HintText hint={children} />
    </p>
  );
}

function Hint({ hint }: { hint: string | null }) {
  if (hint === null) {
    return null;
  }
  return (
    <p className="mt-1 text-muted-foreground text-xs">
      <HintText hint={hint} />
    </p>
  );
}
