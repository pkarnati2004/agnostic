import type { Task } from "@agnostic/core";
import type { WorkspaceClient } from "../api/client";
import { TerminalView } from "../terminal/terminal-view";
import type { TabsState } from "./tabs-state";

type TaskTabsProps = {
  state: TabsState;
  /** Every open tab's task, in tab order. */
  tasks: Task[];
  token: string;
  client: WorkspaceClient;
  onResume: (taskId: string) => Promise<void>;
};

/** Every open tab stays mounted: a hidden one keeps its scrollback and its tmux client. */
export function TaskTabs({ state, tasks, token, client, onResume }: TaskTabsProps) {
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
          onResume={() => onResume(task.id)}
        />
      ))}
    </>
  );
}
