import type { HandoffTaskRequest, Profile, RepoListRow, Task, TaskStatus } from "@agnostic/core";
import { type ReactNode, useState } from "react";
import { Badge } from "../components/badge";
import { Button } from "../components/button";
import { STATUS_DOT } from "../sidebar/status-dot";
import type { TaskNotice } from "../store/task-notices";
import { selectModifier } from "../terminal/select-modifier";
import { sessionTarget } from "../terminal/terminal-phase";
import { HandoffDialog } from "./handoff-dialog";
import { TaskNoticeLine } from "./task-notice-line";

type TaskHeaderProps = {
  task: Task;
  repo: RepoListRow | null;
  profiles: Profile[];
  /** What this task has spent, filled by the page that knows how to read it. */
  cost: ReactNode;
  /** This task's latest failure, drawn here when that is where it was asked for. */
  notice: TaskNotice | null;
  /** None of these reject: a failure comes back as a notice instead. */
  onStop: () => Promise<void>;
  onResume: () => Promise<void>;
  onHandoff: (body: HandoffTaskRequest) => Promise<boolean>;
};

const STOPPABLE: TaskStatus[] = ["running", "waiting"];
const RESUMABLE: TaskStatus[] = ["done", "failed", "stopped"];

export function TaskHeader(props: TaskHeaderProps) {
  const { task, repo, profiles, cost, notice, onStop, onResume, onHandoff } = props;
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    void action().then(
      () => setBusy(false),
      () => setBusy(false),
    );
  };

  return (
    <header className="flex items-start justify-between gap-6 border-border border-b px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: `var(${STATUS_DOT[task.status].token})` }}
          />
          <h1 className="truncate font-semibold text-base">{task.title}</h1>
          <Badge variant="secondary">{STATUS_DOT[task.status].label}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>{repo?.name ?? "unknown repo"}</span>
          <Badge variant="outline">{task.branch ?? "no branch"}</Badge>
          <Badge variant="outline">{task.profileId}</Badge>
          {sessionTarget(task) === "attach" && (
            <span className="ml-auto whitespace-nowrap">
              Wheel scrolls · {selectModifier()}+drag selects
            </span>
          )}
        </div>
        {notice !== null && notice.host === "header" && (
          <div className="mt-2">
            <TaskNoticeLine notice={notice} task={task} />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {cost}
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !STOPPABLE.includes(task.status)}
          onClick={() => run(onStop)}
        >
          Stop
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !RESUMABLE.includes(task.status)}
          onClick={() => run(onResume)}
        >
          Resume
        </Button>
        <HandoffDialog task={task} profiles={profiles} notice={notice} onSubmit={onHandoff} />
      </div>
    </header>
  );
}
