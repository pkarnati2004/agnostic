import type {
  ChangesResponse,
  CreatePrRequest,
  CreatePrResponse,
  EditorId,
  EditorsResponse,
  TaskListRow,
} from "@agnostic/core";
import type { ReactNode } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import type { TaskAction, TaskNotice } from "../store/task-notices";
import { CreatePrDialog } from "./create-pr-dialog";
import { OpenInEditor } from "./open-in-editor";

type ActionRowProps = {
  task: TaskListRow;
  /** Null when the read failed: only Refresh is drawn, so there is nothing to act on. */
  changes: ChangesResponse | null;
  notice: TaskNotice | null;
  editors: EditorsResponse | null;
  /** Which action the panel is waiting on, so its controls do not take a second click. */
  busy: TaskAction | null;
  /** The worktree was cleaned: what needs it is disabled until a resume rebuilds it (ADR 031). */
  cleaned: boolean;
  /** A failed read leaves nothing to act on, so only Refresh is drawn. */
  refreshOnly: boolean;
  loading: boolean;
  onOpen: (editor: EditorId | null) => void;
  onCreatePr: (body: CreatePrRequest) => Promise<CreatePrResponse | null>;
  onRefresh: () => void;
};

const NOT_YET = "Not available yet.";
const RESUME_FIRST = "Resume first: the worktree was cleaned";
const NO_ORIGIN = "This repo has no origin remote.";
const NOTHING_YET = "Nothing to open a pull request for yet.";

/** Everything the panel can do to a task. Bring up to date arrives in the next update. */
export function ActionRow(props: ActionRowProps) {
  const { cleaned, busy, refreshOnly, changes } = props;
  return (
    <div className="flex flex-wrap items-center gap-2 border-border border-b px-4 py-2">
      {!refreshOnly && (
        <>
          <Held tip={cleaned ? RESUME_FIRST : null}>
            <OpenInEditor
              editors={props.editors}
              disabled={cleaned || busy !== null}
              onOpen={props.onOpen}
            />
          </Held>
          {changes !== null && (
            <Held tip={prBlocker(changes)}>
              <CreatePrDialog
                task={props.task}
                changes={changes}
                notice={props.notice}
                disabled={prBlocker(changes) !== null || busy !== null}
                onSubmit={props.onCreatePr}
              />
            </Held>
          )}
          <Held tip={cleaned ? RESUME_FIRST : NOT_YET}>
            <Button variant="outline" size="sm" disabled>
              Bring up to date
            </Button>
          </Held>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={props.loading}
        onClick={props.onRefresh}
      >
        Refresh
      </Button>
    </div>
  );
}

/**
 * Why Create PR cannot be clicked, or null. A cleaned worktree is not a reason: the branch is
 * still there, and the push reads it from the main checkout.
 */
function prBlocker(changes: ChangesResponse): string | null {
  if (changes.remote === null) {
    return NO_ORIGIN;
  }
  return changes.files.length === 0 && changes.ahead === 0 ? NOTHING_YET : null;
}

/** A disabled control swallows its own hover, so the tooltip listens on a wrapper around it. */
function Held({ tip, children }: { tip: string | null; children: ReactNode }) {
  if (tip === null) {
    return <>{children}</>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}
