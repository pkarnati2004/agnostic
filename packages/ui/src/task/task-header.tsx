import type {
  Billing,
  BudgetReport,
  HandoffTaskRequest,
  Profile,
  RepoListRow,
  TaskListRow,
} from "@agnostic/core";
import { GitBranch } from "lucide-react";
import { useState } from "react";
import type { WorkspaceClient } from "../api/client";
import { NoticeLine } from "../notice/notice-line";
import { ProfileChip } from "../profile/profile-chip";
import { useTaskRowActions } from "../sidebar/task-row-actions";
import { StatusPill } from "../status/status-pill";
import type { TaskNotice } from "../store/task-notices";
import { selectModifier } from "../terminal/select-modifier";
import { sessionTarget } from "../terminal/terminal-phase";
import { formatElapsed } from "../time/elapsed";
import { useTick } from "../time/use-tick";
import { ArchiveWarningCard } from "./archive-warning";
import { HeaderActions } from "./task-header-actions";
import { TaskNoticeLine } from "./task-notice-line";

// The elapsed time is minutes old at worst; a render every half minute keeps it honest.
const TICK_MS = 30_000;

export type TaskHeaderProps = {
  task: TaskListRow;
  repo: RepoListRow | null;
  profiles: Profile[];
  /** Passed to the handoff dialog, which refuses a counted profile the daemon would refuse. */
  budget: BudgetReport | null;
  /** Passed to the handoff dialog, whose card asks agn who should take the task next. */
  client: WorkspaceClient;
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

/** What the task in front is, what it is doing, and the things you can do about it. */
export function TaskHeader(props: TaskHeaderProps) {
  const { task, notice } = props;
  const actions = useTaskRowActions();
  const [busy, setBusy] = useState(false);
  const now = useTick(TICK_MS);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action().then(
      () => setBusy(false),
      () => setBusy(false),
    );
  };
  const warning = actions.warning?.taskId === task.id ? actions.warning : null;

  return (
    <>
      <header className="flex shrink-0 flex-col gap-[7px] border-border border-b px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="min-w-0 flex-1 truncate type-heading">{task.title}</h1>
          <HeaderActions {...props} busy={busy} onRun={run} />
        </div>
        <Facts {...props} now={now} />
      </header>
      {task.status === "waiting" && (
        <NoticeLine tone="question">
          The agent asked a question. Answer in the terminal below.
        </NoticeLine>
      )}
      {/* The archive the daemon held back: an answer to the click, not a failure, so it is drawn
          here rather than as one of the page's notices. */}
      {warning !== null && (
        <div className="shrink-0 border-border border-b px-1.5 py-1">
          <ArchiveWarningCard
            warning={warning.warning}
            busy={warning.busy}
            onKeep={actions.keep}
            onArchiveAnyway={() => void actions.archiveAnyway(task.id)}
          />
        </div>
      )}
      {notice !== null && notice.host === "header" && (
        <TaskNoticeLine notice={notice} task={task} />
      )}
    </>
  );
}

/** What the task is: its status, who is running it, where, and for how long. */
function Facts({ task, repo, profiles, now }: TaskHeaderProps & { now: number }) {
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
    </div>
  );
}

function Divider() {
  return <span className="text-input">|</span>;
}

/** The chip says what the profile costs, which only the profile list knows. */
function billingOf(profiles: Profile[], profileId: string): Billing | null {
  return profiles.find((profile) => profile.id === profileId)?.billing ?? null;
}
