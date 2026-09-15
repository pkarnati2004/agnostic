import type { Task } from "@agnostic/core";
import type { WorkspaceClient } from "../api/client";
import { TerminalView } from "../terminal/terminal-view";
import type { TabsState } from "./tabs-state";

/** A worktree a resume rebuilt, which the task's own tab says above its pane (ADR 031). */
export type Recreated = { taskId: string; branch: string | null };

type TaskTabsProps = {
  state: TabsState;
  /** Every open tab's task, in tab order. */
  tasks: Task[];
  token: string;
  client: WorkspaceClient;
  /** The last resume's answer, for whichever tab it was; only that tab shows it. */
  recreated: Recreated | null;
  onResume: (taskId: string) => Promise<void>;
};

/** Every open tab stays mounted: a hidden one keeps its scrollback and its tmux client. */
export function TaskTabs({ state, tasks, token, client, recreated, onResume }: TaskTabsProps) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <>
      {tasks.map((task) => (
        <TerminalView
          key={task.id}
          task={task}
          token={token}
          client={client}
          active={task.id === state.active}
          recreatedFrom={recreated?.taskId === task.id ? recreated.branch : null}
          onResume={() => onResume(task.id)}
        />
      ))}
    </>
  );
}
