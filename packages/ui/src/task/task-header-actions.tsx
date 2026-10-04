import type { TaskStatus } from "@agnostic/core";
import { Archive, MoreHorizontal, PanelRight, Play, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { TaskMenu } from "../sidebar/task-menu";
import { ARCHIVE_TOOLTIP, canArchive } from "../sidebar/task-menu-items";
import { useTaskRowActions } from "../sidebar/task-row-actions";
import { HandoffDialog } from "./handoff-dialog";
import type { TaskHeaderProps } from "./task-header";
import { worktreeGone } from "./worktree-gone";

const STOPPABLE: TaskStatus[] = ["running", "waiting"];
const RESUMABLE: TaskStatus[] = ["done", "failed", "stopped"];

type ActionsProps = TaskHeaderProps & {
  busy: boolean;
  onRun: (action: () => Promise<void>) => void;
};

/** Stop or Resume by status, because the daemon refuses whichever of the two does not apply. */
export function HeaderActions({ task, profiles, busy, onRun, ...props }: ActionsProps) {
  const actions = useTaskRowActions();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      {STOPPABLE.includes(task.status) && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onRun(props.onStop)}>
          <Square />
          Stop
        </Button>
      )}
      {RESUMABLE.includes(task.status) && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onRun(props.onResume)}>
          <Play />
          Resume
        </Button>
      )}
      {/* A worktree agn made and no longer has is nothing to hand off: the next agent would have
          nowhere to work until a resume rebuilds it. */}
      {!worktreeGone(task) && (
        <HandoffDialog
          task={task}
          profiles={profiles}
          budget={props.budget}
          notice={props.notice}
          client={props.client}
          onSubmit={props.onHandoff}
          open={props.handoffOpen}
          onOpenChange={props.onHandoffOpenChange}
        />
      )}
      {canArchive(task) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRun(() => actions.archive(task.id).then(() => undefined))}
            >
              <Archive />
              Archive
            </Button>
          </TooltipTrigger>
          <TooltipContent>{ARCHIVE_TOOLTIP}</TooltipContent>
        </Tooltip>
      )}
      <TaskMenu
        task={task}
        placement="header"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        // The header draws the refused archive under itself, not inside the menu.
        warning={null}
        busy={false}
        onKeep={actions.keep}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        }
      />
      <ChangesToggle
        open={props.changesOpen}
        files={props.files}
        onToggle={props.onToggleChanges}
      />
    </>
  );
}

/** Open, the toggle is the icon alone: the column beside it says what it opened. */
function ChangesToggle({
  open,
  files,
  onToggle,
}: {
  open: boolean;
  files: number | null;
  onToggle: () => void;
}) {
  if (open) {
    return (
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label="Changes"
        aria-pressed
        onClick={onToggle}
      >
        <PanelRight />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" aria-pressed={false} onClick={onToggle}>
      <PanelRight />
      Changes
      {files !== null && <span className="text-muted-foreground type-mono">{files}</span>}
    </Button>
  );
}
