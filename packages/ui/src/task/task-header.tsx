import type {
  Billing,
  BudgetReport,
  HandoffTaskRequest,
  Profile,
  RepoListRow,
  TaskListRow,
  TaskStatus,
} from "@agnostic/core";
import { GitBranch, PanelRight, Play, Square } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "../components/button";
import { ProfileChip } from "../profile/profile-chip";
import { StatusPill } from "../status/status-pill";
import type { TaskNotice } from "../store/task-notices";
import { selectModifier } from "../terminal/select-modifier";
import { sessionTarget } from "../terminal/terminal-phase";
import { formatElapsed } from "../time/elapsed";
import { useTick } from "../time/use-tick";
import { HandoffDialog } from "./handoff-dialog";
import { TaskNoticeLine } from "./task-notice-line";
import { worktreeGone } from "./worktree-gone";

// The elapsed time is minutes old at worst; a render every half minute keeps it honest.
const TICK_MS = 30_000;

const STOPPABLE: TaskStatus[] = ["running", "waiting"];
const RESUMABLE: TaskStatus[] = ["done", "failed", "stopped"];

export type TaskHeaderProps = {
  task: TaskListRow;
  repo: RepoListRow | null;
  profiles: Profile[];
  /** Passed to the handoff dialog, which refuses a counted profile the daemon would refuse. */
  budget: BudgetReport | null;
  /** What this task has spent, filled by the page that knows how to read it. */
  cost: ReactNode;
  /** How many files the Changes panel found on its last read of this task; null before one. */
  files: number | null;
  /** This task's latest failure, drawn here when that is where it was asked for. */
  notice: TaskNotice | null;
  /** Whether the Changes column is open, which is what the toggle reports and flips. */
  changesOpen: boolean;
  onToggleChanges: () => void;
  /** None of these reject: a failure comes back as a notice instead. */
  onStop: () => Promise<void>;
  onResume: () => Promise<void>;
  onHandoff: (body: HandoffTaskRequest) => Promise<boolean>;
  /** Given when the command palette opened the handoff dialog rather than its button. */
  handoffOpen?: boolean;
  onHandoffOpenChange?: (open: boolean) => void;
};

/** What the task in front is, what it is doing, and the three things you can do about it. */
export function TaskHeader(props: TaskHeaderProps) {
  const { task, notice } = props;
  const [busy, setBusy] = useState(false);
  const now = useTick(TICK_MS);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action().then(
      () => setBusy(false),
      () => setBusy(false),
    );
  };

  return (
    <>
      <header className="flex shrink-0 flex-col gap-[7px] border-border border-b px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="min-w-0 flex-1 truncate type-heading">{task.title}</h1>
          <Actions {...props} busy={busy} onRun={run} />
        </div>
        <Facts {...props} now={now} />
      </header>
      {notice !== null && notice.host === "header" && (
        <TaskNoticeLine notice={notice} task={task} />
      )}
    </>
  );
}

/** Stop or Resume by status, because the daemon refuses whichever of the two does not apply. */
function Actions({
  task,
  profiles,
  busy,
  onRun,
  ...props
}: TaskHeaderProps & { busy: boolean; onRun: (action: () => Promise<void>) => void }) {
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
          onSubmit={props.onHandoff}
          open={props.handoffOpen}
          onOpenChange={props.onHandoffOpenChange}
        />
      )}
      <ChangesToggle
        open={props.changesOpen}
        files={props.files}
        onToggle={props.onToggleChanges}
      />
    </>
  );
}

/** What the task is: its status, who is running it, where, and for how long. */
function Facts({ task, repo, profiles, cost, now }: TaskHeaderProps & { now: number }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-muted-foreground type-meta">
      <StatusPill
        status={task.status}
        detail={task.status === "waiting" ? formatElapsed(task.updatedAt, now) : null}
      />
      <ProfileChip profileId={task.profileId} billing={billingOf(profiles, task.profileId)} />
      <Divider />
      <span className="truncate">{repo?.name ?? "unknown repo"}</span>
      <span className="inline-flex min-w-0 items-center gap-1 type-mono">
        <GitBranch className="size-3 shrink-0" />
        <span className="truncate">{task.branch ?? "no branch"}</span>
      </span>
      <Divider />
      <span className="whitespace-nowrap">{formatElapsed(task.createdAt, now)} elapsed</span>
      {sessionTarget(task) === "attach" && (
        <span className="whitespace-nowrap">Wheel scrolls · {selectModifier()}+drag selects</span>
      )}
      {cost}
    </div>
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

function Divider() {
  return <span className="text-input">|</span>;
}

/** The chip says what the profile costs, which only the profile list knows. */
function billingOf(profiles: Profile[], profileId: string): Billing | null {
  return profiles.find((profile) => profile.id === profileId)?.billing ?? null;
}
