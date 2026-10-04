import type { TaskListRow } from "@agnostic/core";
import { ArrowRightLeft, Eye, MonitorOff, Play, PowerOff } from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import { cn } from "../class-names";
import { profileParts } from "../profile/profile-parts";
import type { TaskNotice } from "../store/task-notices";
import { TaskNoticeLine } from "../task/task-notice-line";
import { worktreeGone } from "../task/worktree-gone";

export type OverlayPhase = "starting" | "reconnecting" | "ended" | "unattachable";

const WAITING: Record<"starting" | "reconnecting", string> = {
  starting: "Starting…",
  reconnecting: "Reconnecting…",
};

const ENDED_LINE =
  "The tmux session for this task is gone. The worktree and its changes are intact.";

export type SessionOverlayProps = {
  phase: OverlayPhase;
  task: Pick<
    TaskListRow,
    "id" | "title" | "branch" | "profileId" | "session" | "worktreePath" | "worktreePresent"
  >;
  /** What the last close said, when it said anything. */
  notice: string | null;
  /** This task's latest failure, drawn here when the Resume that failed was this one. */
  failure: TaskNotice | null;
  onResume: () => Promise<void>;
  /** Opens the task header's handoff dialog: one dialog on the page, wherever it was asked for. */
  onHandoff: () => void;
};

/** Covers the pane whenever there is no live session behind it; the terminal keeps its buffer. */
export function SessionOverlay(props: SessionOverlayProps) {
  const { phase, task, notice, failure } = props;
  return (
    // Above the terminal: xterm's own element is positioned and comes later in the pane.
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95">
      <div className="flex w-[420px] flex-col gap-3.5">
        {phase === "ended" && <Ended {...props} />}
        {phase === "unattachable" && <Unattachable task={task} />}
        {(phase === "starting" || phase === "reconnecting") && (
          <p className="text-center text-sm">{WAITING[phase]}</p>
        )}
        {failure !== null && failure.host === "overlay" && (
          <TaskNoticeLine notice={failure} task={task} />
        )}
        {notice !== null && phase !== "ended" && (
          <p className="text-center text-muted-foreground type-meta">{notice}</p>
        )}
      </div>
    </div>
  );
}

/** The session is over and the work is not: resume it, or give it to another agent (GAPS item 12b). */
function Ended({ task, notice, onResume, onHandoff }: SessionOverlayProps) {
  const [busy, setBusy] = useState(false);
  const resume = () => {
    setBusy(true);
    // A failure comes back as the notice below; this only stops the row being clicked twice.
    void onResume().then(
      () => setBusy(false),
      () => setBusy(false),
    );
  };
  const harness = task.session?.harness ?? profileParts(task.profileId).harness;
  const where = task.branch ?? "the checkout";
  return (
    <>
      <Head icon={PowerOff} title="Session ended" body={notice ?? ENDED_LINE} />
      <div className="flex flex-col gap-1.5">
        <OptionRow
          icon={Play}
          title="Resume session"
          body={`Reopens the conversation with ${harness} in ${where}`}
          primary
          disabled={busy}
          onClick={resume}
        />
        {/* A worktree agn made and no longer has is nothing to hand off: the next agent would
            have nowhere to work until a resume rebuilds it. */}
        {!worktreeGone(task) && (
          <OptionRow
            icon={ArrowRightLeft}
            title="Hand off"
            body="Continue with a different agent"
            onClick={onHandoff}
          />
        )}
      </div>
      <ShellLine command={`agn resume ${task.id}`} />
    </>
  );
}

/** An adopted session outside tmux: agn reports it and cannot type into it (ADR 027). */
function Unattachable({ task }: { task: SessionOverlayProps["task"] }) {
  const pid = task.session?.pid ?? null;
  const started =
    pid === null
      ? "This session started outside tmux."
      : `This session started outside tmux (pid ${pid}).`;
  return (
    <>
      <Head
        icon={MonitorOff}
        title="Terminal not attachable"
        body={`${started} agnostic tracks its status and changes but cannot show or type into it.`}
      />
      <div className="flex flex-col gap-1.5">
        <OptionRow
          icon={Eye}
          title="Keep watching status"
          body="Answer questions in the terminal it runs in"
        />
      </div>
      <ShellLine command={`agn status ${task.id}`} />
    </>
  );
}

type IconProps = { className?: string };

function Head({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
}) {
  return (
    <>
      <Icon className="size-5 text-muted-foreground" />
      <div className="flex flex-col gap-1.5">
        <h2 className="font-semibold text-[16px]">{title}</h2>
        <p className="text-[13px] text-muted-foreground leading-normal">{body}</p>
      </div>
    </>
  );
}

type OptionRowProps = {
  icon: ComponentType<IconProps>;
  title: string;
  body: string;
  primary?: boolean;
  disabled?: boolean;
  /** Absent for a row that names what the page already does rather than something to click. */
  onClick?: () => void;
};

/** One choice: a title, a line saying what it does, and the icon that stands for it. */
function OptionRow({ icon: Icon, title, body, primary, disabled, onClick }: OptionRowProps) {
  const inner: ReactNode = (
    <>
      <Icon className={cn("size-3.5 shrink-0", primary !== true && "text-muted-foreground")} />
      <span className="flex min-w-0 flex-col gap-0.5 text-left">
        <span className="text-[13px]">{title}</span>
        <span className="text-muted-foreground type-meta">{body}</span>
      </span>
    </>
  );
  const shape = "flex items-center gap-2.5 rounded-lg px-3 py-2.5";
  if (onClick === undefined) {
    return <div className={cn(shape, "border border-border")}>{inner}</div>;
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        shape,
        primary === true ? "bg-muted" : "border border-border",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {inner}
    </button>
  );
}

function ShellLine({ command }: { command: string }) {
  return (
    <p className="text-muted-foreground type-meta">
      From a shell: <span className="type-mono text-sidebar-foreground">{command}</span>
    </p>
  );
}
