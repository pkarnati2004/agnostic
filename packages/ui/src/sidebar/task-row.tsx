import type { RepoListRow, TaskListRow } from "@agnostic/core";
import { cn } from "../class-names";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip";
import { HarnessMark } from "../profile/harness-mark";
import { profileParts } from "../profile/profile-parts";
import { STATUS_DOT } from "../status/status-dot";
import { StatusGlyph } from "../status/status-glyph";
import { worktreeGone } from "../task/worktree-gone";
import { childLine, type RowLine, rowSecondLine } from "./row-lines";

const DIM = ["done", "stopped"];

const TONE: Record<RowLine["tone"], string> = {
  muted: "text-muted-foreground",
  queued: "text-[var(--status-queued)]",
  failed: "text-[var(--status-failed)]",
};

/** Waiting reads from across the room: a left edge when the row is in front, a tint when it is not. */
const WAITING_SELECTED =
  "bg-[color-mix(in_srgb,var(--status-waiting)_9%,transparent)] " +
  "shadow-[inset_2px_0_0_var(--status-waiting)]";
const WAITING = "bg-[color-mix(in_srgb,var(--status-waiting)_7%,transparent)]";

type TaskRowProps = {
  task: TaskListRow;
  /** The repo it runs in, for what a queued row is waiting on; null where the page has no row. */
  repo: Pick<RepoListRow, "testCommand"> | null;
  selected: boolean;
  /** The task this one was handed off from, when both are live: the row indents under it. */
  parent?: TaskListRow | null;
  onSelect: (id: string) => void;
};

/** One task in the sidebar: where it is, what it is called, who is running it, and what it is on. */
export function TaskRow({ task, repo, selected, parent, onSelect }: TaskRowProps) {
  const cleaned = worktreeGone(task);
  const waiting = task.status === "waiting";
  const child = parent != null;
  const line = child ? childLine(parent.profileId) : rowSecondLine(task, repo);
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      data-status={task.status}
      data-selected={selected}
      data-cleaned={cleaned}
      data-child={child}
      className={cn(
        "relative flex w-full flex-col gap-0.5 rounded-[7px] px-2 py-1.5 text-left",
        "hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-[2px]",
        "focus-visible:ring-sidebar-ring",
        selected && !waiting && "bg-sidebar-accent",
        waiting && (selected ? WAITING_SELECTED : WAITING),
        cleaned && "opacity-55",
        child && "pl-[22px]",
      )}
    >
      {child && (
        <span
          aria-hidden
          className="absolute top-0 left-[11px] h-[14px] w-[8px] rounded-bl border-input border-b border-l"
        />
      )}
      <span className="flex min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <StatusGlyph status={task.status} cleaned={cleaned} />
          </TooltipTrigger>
          <TooltipContent>{STATUS_DOT[task.status].label}</TooltipContent>
        </Tooltip>
        <span className="min-w-0 flex-1 truncate text-sidebar-foreground text-[13px]">
          {task.title}
        </span>
        <HarnessMark
          harness={profileParts(task.profileId).harness}
          dim={DIM.includes(task.status)}
        />
      </span>
      <SecondLine line={line} />
    </button>
  );
}

/** The branch, what the row is waiting on, or how it ended: one line, chosen by status. */
function SecondLine({ line }: { line: RowLine }) {
  return (
    <span className={cn("truncate pl-4", TONE[line.tone], line.mono ? "type-mono" : "text-[11px]")}>
      {line.text}
    </span>
  );
}
