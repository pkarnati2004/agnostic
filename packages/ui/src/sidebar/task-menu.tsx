import type { TaskListRow } from "@agnostic/core";
import { Fragment, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";
import type { ArchiveWarning } from "../task/archive-copy";
import { ArchiveWarningCard } from "../task/archive-warning";
import { type MenuItem, type MenuPlacement, menuSections } from "./task-menu-items";
import { type TaskRowActions, useTaskRowActions } from "./task-row-actions";

type TaskMenuProps = {
  task: TaskListRow;
  placement: MenuPlacement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The in-place step after a refused archive; null draws the items. */
  warning: ArchiveWarning | null;
  /** Whether the Archive anyway retry is running, which is what the card's buttons wait on. */
  busy: boolean;
  onKeep: () => void;
  /** The control the menu hangs off: the row's overflow button, or the header's. */
  trigger: ReactNode;
};

/** One task's menu, from its row or from the task header. The trigger is the caller's. */
export function TaskMenu({
  task,
  placement,
  warning,
  busy,
  onKeep,
  trigger,
  ...on
}: TaskMenuProps) {
  const actions = useTaskRowActions();
  return (
    <DropdownMenu open={on.open} onOpenChange={on.onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={placement === "row" ? "right" : "bottom"}
        align="end"
        // The row under the menu is a button of its own: a click in here is not a click on it.
        onClick={(event) => event.stopPropagation()}
      >
        {warning !== null ? (
          <ArchiveWarningCard
            warning={warning}
            busy={busy}
            onKeep={onKeep}
            onArchiveAnyway={() => void actions.archiveAnyway(task.id)}
          />
        ) : (
          menuSections(task, placement).map((section, index) => (
            <Fragment key={section.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                {section.items.map((item) => (
                  <Row key={item.id} item={item} task={task} actions={actions} />
                ))}
              </DropdownMenuGroup>
            </Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({
  item,
  task,
  actions,
}: {
  item: MenuItem;
  task: TaskListRow;
  actions: TaskRowActions;
}) {
  return (
    <DropdownMenuItem
      tone={item.tone}
      disabled={item.disabled !== null}
      title={item.tooltip ?? undefined}
      onSelect={(event) => {
        // Archive answers in place when the worktree is dirty, so the menu stays where it is.
        if (item.id === "archive") {
          event.preventDefault();
        }
        run(item.id, task, actions);
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.label}</span>
        {/* A row that cannot be used says why in the row itself: a disabled item takes no pointer
            and no keyboard focus, so a tooltip on it would never be read. */}
        {item.disabled !== null && (
          <span className="truncate text-[11.5px] text-muted-foreground">{item.disabled}</span>
        )}
      </span>
      {item.meta !== null && <span className="text-muted-foreground type-mono">{item.meta}</span>}
    </DropdownMenuItem>
  );
}

function run(id: MenuItem["id"], task: TaskListRow, actions: TaskRowActions): void {
  switch (id) {
    case "copy-branch":
      if (task.branch !== null) {
        void actions.copy(task.branch);
      }
      break;
    case "copy-id":
      void actions.copy(task.id);
      break;
    case "copy-attach":
      void actions.copy(`agn attach ${task.id}`);
      break;
    case "open":
      actions.openInEditor(task.id);
      break;
    case "stop":
      actions.stop(task.id);
      break;
    case "resume":
      actions.resume(task.id);
      break;
    case "handoff":
      actions.handoff(task.id);
      break;
    case "pr":
      actions.createPr(task.id);
      break;
    case "archive":
      void actions.archive(task.id, "row");
      break;
    case "delete":
      actions.requestDelete(task.id);
      break;
  }
}
