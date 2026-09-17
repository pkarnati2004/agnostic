import type { Task } from "@agnostic/core";
import { useState } from "react";
import { Button } from "../components/button";
import type { TaskNotice } from "../store/task-notices";
import { TaskNoticeLine } from "../task/task-notice-line";

export type OverlayPhase = "starting" | "reconnecting" | "ended" | "unattachable";

const LINES: Record<OverlayPhase, string> = {
  starting: "Starting…",
  reconnecting: "Reconnecting…",
  ended: "Session ended.",
  unattachable: "This session runs outside tmux; agn can watch it but not attach.",
};

type SessionOverlayProps = {
  phase: OverlayPhase;
  task: Pick<Task, "title">;
  /** What the last close said, when it said anything. */
  notice: string | null;
  /** This task's latest failure, drawn here when the Resume that failed was this one. */
  failure: TaskNotice | null;
  onResume: () => Promise<void>;
};

/** Covers the pane whenever there is no live session behind it; the terminal keeps its buffer. */
export function SessionOverlay({ phase, task, notice, failure, onResume }: SessionOverlayProps) {
  const [busy, setBusy] = useState(false);
  const resume = () => {
    setBusy(true);
    // A failure comes back as the notice below; this button only stops it being asked twice.
    void onResume().then(
      () => setBusy(false),
      () => setBusy(false),
    );
  };

  return (
    // Above the terminal: xterm's own element is positioned and comes later in the pane.
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/95">
      <p className="text-foreground text-sm">{LINES[phase]}</p>
      {notice !== null && <p className="text-muted-foreground text-xs">{notice}</p>}
      {failure !== null && failure.host === "overlay" && (
        <TaskNoticeLine notice={failure} task={task} />
      )}
      {phase === "ended" && (
        <Button size="sm" onClick={resume} disabled={busy}>
          Resume
        </Button>
      )}
    </div>
  );
}
