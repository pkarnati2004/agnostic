import type {
  ChangesResponse,
  CreatePrRequest,
  CreatePrResponse,
  EditorId,
  EditorsResponse,
  TaskListRow,
} from "@agnostic/core";
import { GitMerge } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import type { TaskAction, TaskNotice } from "../store/task-notices";
import { canAskCommit } from "./commit-result";
import { CreatePrDialog } from "./create-pr-dialog";
import { OpenInEditor } from "./open-in-editor";
import { updateTooltip } from "./update-tooltip";

type ActionRowProps = {
  task: TaskListRow;
  changes: ChangesResponse;
  notice: TaskNotice | null;
  editors: EditorsResponse | null;
  /** Which action the panel is waiting on, so its controls do not take a second click. */
  busy: TaskAction | null;
  /** The worktree was cleaned: what needs it is disabled until a resume rebuilds it (ADR 031). */
  cleaned: boolean;
  onOpen: (editor: EditorId | null) => void;
  onCreatePr: (body: CreatePrRequest) => Promise<CreatePrResponse | null>;
  onAskCommit: () => void;
  onUpdate: () => void;
  /** Given when the command palette opened the Create PR dialog rather than its button. */
  prOpen?: boolean;
  onPrOpenChange?: (open: boolean) => void;
};

const RESUME_FIRST = "Resume first: the worktree was cleaned";
const NO_ORIGIN = "This repo has no origin remote.";
const NOTHING_YET = "Nothing to open a pull request for yet.";
const NO_BRANCH = "This task works in the checkout itself, so it has no branch to update.";
const NOTHING_TO_COMMIT = "Nothing to commit: the working tree is clean.";
const NO_COMMIT_BRANCH =
  "This task works in the checkout itself, so agn has no branch to commit on.";
const NO_AGENT = "There is no agent to ask yet.";

/** Everything the panel can do to a task. Refresh is in the header, over the count it refreshes. */
export function ActionRow(props: ActionRowProps) {
  const { cleaned, busy, changes, task } = props;
  const behind = changes.behind ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-border border-b px-3.5 pb-2.5">
      <Held tip={cleaned ? RESUME_FIRST : null}>
        <OpenInEditor
          editors={props.editors}
          disabled={cleaned || busy !== null}
          onOpen={props.onOpen}
        />
      </Held>
      <Held tip={prBlocker(changes)}>
        <CreatePrDialog
          task={task}
          changes={changes}
          notice={props.notice}
          disabled={prBlocker(changes) !== null || busy !== null}
          onSubmit={props.onCreatePr}
          open={props.prOpen}
          onOpenChange={props.onPrOpenChange}
        />
      </Held>
      <Held tip={commitTip(task, changes, cleaned)}>
        <Button
          variant="outline"
          size="sm"
          disabled={!canAskCommit(task, changes.uncommitted) || busy !== null}
          onClick={props.onAskCommit}
        >
          Ask the agent to commit
        </Button>
      </Held>
      <Held tip={updateTip(task, changes, cleaned)}>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={updateBlocked(task, cleaned) || busy !== null}
          onClick={props.onUpdate}
        >
          <GitMerge style={behind > 0 ? { color: "var(--warning)" } : undefined} />
          Bring up to date
        </Button>
      </Held>
    </div>
  );
}

/** What the agent will be asked to do, or why nobody can ask it yet (ADR 036 Q6). */
function updateTip(task: TaskListRow, changes: ChangesResponse, cleaned: boolean): string {
  if (cleaned) {
    return RESUME_FIRST;
  }
  return task.branch === null
    ? NO_BRANCH
    : updateTooltip(task.branch, changes.base.ref, changes.pushed);
}

/** What the ask will send, or why nobody can send it yet. */
function commitTip(task: TaskListRow, changes: ChangesResponse, cleaned: boolean): string {
  if (cleaned) {
    return RESUME_FIRST;
  }
  if (task.branch === null || task.worktreePath === null) {
    return NO_COMMIT_BRANCH;
  }
  if (changes.uncommitted === 0) {
    return nothingToCommit(changes);
  }
  return canAskCommit(task, changes.uncommitted)
    ? `Sends the agent a prompt to commit its work on \`${task.branch}\`: the text of ` +
        ".ag/prompts/commit.md, or agn's default. agn runs no git command itself."
    : NO_AGENT;
}

/** Says what the list below the button is, because at zero uncommitted it is the branch's commits. */
function nothingToCommit(changes: ChangesResponse): string {
  if (changes.files.length === 0) {
    return NOTHING_TO_COMMIT;
  }
  return `${NOTHING_TO_COMMIT} The files listed are the branch's commits against ${changes.base.ref}.`;
}

function updateBlocked(task: TaskListRow, cleaned: boolean): boolean {
  return cleaned || task.branch === null;
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
