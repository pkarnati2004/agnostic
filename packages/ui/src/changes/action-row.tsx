import type { EditorId, EditorsResponse } from "@agnostic/core";
import type { ReactNode } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import type { TaskAction } from "../store/task-notices";
import { OpenInEditor } from "./open-in-editor";

type ActionRowProps = {
  editors: EditorsResponse | null;
  /** Which action the panel is waiting on, so its controls do not take a second click. */
  busy: TaskAction | null;
  /** The worktree was cleaned: what needs it is disabled until a resume rebuilds it (ADR 031). */
  cleaned: boolean;
  /** A failed read leaves nothing to act on, so only Refresh is drawn. */
  refreshOnly: boolean;
  loading: boolean;
  onOpen: (editor: EditorId | null) => void;
  onRefresh: () => void;
};

const NOT_YET = "Not available yet.";
const RESUME_FIRST = "Resume first: the worktree was cleaned";

/** Everything the panel can do to a task. Create PR and Bring up to date arrive in the next update. */
export function ActionRow(props: ActionRowProps) {
  const { cleaned, busy, refreshOnly } = props;
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
          <Held tip={NOT_YET}>
            <Button variant="outline" size="sm" disabled>
              Create PR
            </Button>
          </Held>
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
